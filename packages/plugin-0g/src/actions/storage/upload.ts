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
        console.log("Upload context:", uploadContext);
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
            const filePath = content.object.filePath;

            // Check if file exists and is accessible
            try {
                await fs.access(filePath);
            } catch (error) {
                elizaLogger.error(
                    `File ${filePath} does not exist or is not accessible:`,
                    error
                );
                throw new Error(`File ${filePath} does not exist or is not accessible`);
            }

            const file = await ZgFile.fromFilePath(filePath);
            var [tree, err] = await file.merkleTree();
            if (err === null) {
                elizaLogger.log("File Root Hash:", tree.rootHash());
            } else {
                elizaLogger.error("Error getting file root hash:", err);
                throw new Error(`Error getting file root hash: ${err}`);
            }

            const provider = new ethers.JsonRpcProvider(zgEvmRpc);
            const signer = new ethers.Wallet(zgPrivateKey, provider);
            const indexer = new Indexer(zgIndexerRpc);

            var [tx, err] = await indexer.upload(file, zgEvmRpc, signer);
            if (err === null) {
                elizaLogger.info("File uploaded successfully, tx:", tx);
            } else {
                elizaLogger.error("Error uploading file:", err);
                throw new Error(`Error uploading file: ${err}`);
            }

            await file.close();

            if (callback) {
                callback({
                    text: `File ${content.object.filePath} uploaded successfully, tx:${tx}`,
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
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload resume.pdf under current directory to ZeroG",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload resume.pdf to ZeroG",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload resume.pdf to Zero Gravity",
                },
            },
        ]
    ] as ActionExample[][],
} as Action;
