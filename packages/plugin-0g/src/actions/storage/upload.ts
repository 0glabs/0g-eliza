import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    ActionExample,
    generateObjectV2,
    elizaLogger
} from "@ai16z/eliza";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";
import { composeContext, settings } from "@ai16z/eliza";
import { promises as fs } from "fs";

import { zgsExtractFilePathTemplate } from "../../templates/storage/extract_file_path";
import { FilePathSchema, isFilePathContent } from "../../types";
import { validateZeroGConfig } from "../../enviroment";
import tmp from "tmp";
import { createWriteStream } from 'fs';
import * as https from "https";
import * as http from "http";

export const zgsUpload: Action = {
    name: "ZGS_UPLOAD",
    similes: [
        "UPLOAD_FILE_TO_ZG",
        "STORE_FILE_ON_ZG",
        "SAVE_FILE_TO_ZG",
        "UPLOAD_TO_ZERO_GRAVITY",
        "STORE_ON_ZERO_GRAVITY",
        "SHARE_FILE_ON_ZG",
        "PUBLISH_FILE_TO_ZG",
    ],
    description: "Store data using 0G protocol",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating upload from user:", message.userId);
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        console.log("ZG_UPLOAD action called");
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Get current directory and list files in it
        const currentDir = process.cwd();
        const filesInCurrentDir = await fs.readdir(currentDir);

        // Replace template variables
        const promptTemplate = zgsExtractFilePathTemplate
            .replace("{{listFilesInCurrentDir}}", filesInCurrentDir.join(", "))
            .replace("${process.cwd()}", currentDir);

        // Compose upload context
        const uploadContext = composeContext({
            state,
            template: promptTemplate,
        });
        // console.log("Upload context:", uploadContext);
        // Generate upload content
        const content = await generateObjectV2({
            runtime,
            context: uploadContext,
            modelClass: ModelClass.SMALL,
            schema: FilePathSchema,
        });
        console.log("Upload content:", content.object);
        // Validate upload content
        if (!isFilePathContent(content.object)) {
            throw new Error("Invalid content");
        }
        const zgConfig = await validateZeroGConfig(runtime);
        try {
            const zgIndexerRpc = zgConfig.ZEROG_INDEXER_RPC_URL;
            const zgEvmRpc = zgConfig.ZEROG_RPC_URL;
            const zgPrivateKey = zgConfig.ZEROG_PRIVATE_KEY;
            let filePath = content.object.filePath;

            // Check if file exists and is accessible
            try {
                if (content.object.isUrl) {
                    elizaLogger.log("Getting file from url:", filePath);
                    const tmpFile = tmp.fileSync({ postfix: ".tmp" });
                    const tmpFilePath = tmpFile.name;
                    const downloadFile = async (url: string, dest: string): Promise<void> => {
                        return new Promise((resolve, reject) => {
                            const protocol = url.startsWith("https") ? https : http;
                            const fileStream = createWriteStream(dest);

                            protocol
                                .get(url, (response) => {
                                    if (response.statusCode !== 200) {
                                        reject(
                                            new Error(
                                                `Failed to get file from URL. Status code: ${response.statusCode}`
                                            )
                                        );
                                        return;
                                    }

                                    response.pipe(fileStream);
                                    fileStream.on("finish", () => {
                                        fileStream.close(() => {
                                            elizaLogger.log("File successfully downloaded to:", dest);
                                            resolve();
                                        });
                                    });
                                })
                                .on("error", (err) => {
                                    fs.unlink(dest).catch(() => {
                                        elizaLogger.error("Failed to clean up temporary file:", dest);
                                    });
                                    reject(err);
                                });
                        });
                    };
                    await downloadFile(filePath, tmpFilePath);
                    filePath = tmpFilePath;
                } else {
                    await fs.access(filePath);
                }
            } catch (error) {
                elizaLogger.error(
                    `File ${filePath} does not exist or is not accessible:`,
                    error
                );
                throw new Error(`File ${filePath} does not exist or is not accessible`);
            }

            const file = await ZgFile.fromFilePath(filePath);
            var [tree, err] = await file.merkleTree();
            const rootHash = tree.rootHash();
            if (err === null) {
                elizaLogger.log("File Root Hash:", rootHash);
            } else {
                elizaLogger.error("Error getting file root hash:", err);
                throw new Error(`Error getting file root hash: ${err}`);
            }

            const provider = new ethers.JsonRpcProvider(zgEvmRpc);
            const { gasPrice } = await provider.getFeeData();
            elizaLogger.info(`current average gasPrice: ${gasPrice}, using: ${BigInt(Math.round(Number(gasPrice) * 10))}`);
            const signer = new ethers.Wallet(zgPrivateKey, provider);
            const indexer = new Indexer(zgIndexerRpc);

            var [tx, err] = await indexer.upload(file, zgEvmRpc, signer, undefined, {
                Retries: 3,
                Interval: 1000,
                MaxGasPrice: Math.round(Number(gasPrice) * 20) ?? undefined
            }, {
                gasPrice: BigInt(Math.round(Number(gasPrice) * 10)) ?? undefined
            });
            if (err !== null) {
                if (err.message.includes("Data already exists")) {
                    elizaLogger.info("Data already exists in storage network, skipping upload");
                } else {
                    elizaLogger.error(`Error indexer uploading file: ${err.message}`);
                    throw err;
                }
            }

            await file.close();

            if (callback) {
                callback({
                    text: `File ${content.object.filePath} uploaded successfully, tx:${tx}, root hash:${rootHash}`,
                });
            }
        } catch (error) {
            if (callback) {
                callback({
                    text: `Error uploading file ${content.object.filePath}: ${error}`,
                });
            }
            elizaLogger.error("Error uploading file:", error);
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload /root/resume.pdf to ZeroG",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "uploading /root/resume.pdf to ZeroG",
                    action: "ZGS_UPLOAD",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload resume.pdf under current directory to ZeroG",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "uploading resume.pdf under current directory to ZeroG",
                    action: "ZGS_UPLOAD",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload resume.pdf to ZeroG",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "uploading resume.pdf to ZeroG",
                    action: "ZGS_UPLOAD",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload resume.pdf to Zero Gravity",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "uploading resume.pdf to Zero Gravity",
                    action: "ZGS_UPLOAD",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload the file to Zero Gravity [document: resume.pdf] [url: https://www.google.com]",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "uploading the file to Zero Gravity [document: resume.pdf] [url: https://www.google.com]",
                    action: "ZGS_UPLOAD",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload the file to Zero Gravity [image: resume.pdf] [url: https://www.google.com]",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "uploading the file to Zero Gravity [image: resume.pdf] [url: https://www.google.com]",
                    action: "ZGS_UPLOAD",
                },
            }
        ]
    ] as ActionExample[][],
} as Action;
