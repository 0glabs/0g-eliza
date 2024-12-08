import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    ActionExample,
    generateObjectV2,
    generateObject,
} from "@ai16z/eliza";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";
import { composeContext, settings } from "@ai16z/eliza";
import { promises as fs } from "fs";

import { uploadTemplate } from "../templates/upload";
import { UploadSchema, isUploadContent } from "../types";

export const zgUpload: Action = {
    name: "ZG_UPLOAD",
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
        const promptTemplate = uploadTemplate
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
            schema: UploadSchema,
        });
        console.log("Upload content:", content.object);
        // Validate upload content
        if (!isUploadContent(content.object)) {
            throw new Error("Invalid content");
        }

        try {
            const zgIndexerRpc = settings.ZEROG_INDEXER_RPC;
            const zgEvmRpc = settings.ZEROG_EVM_RPC;
            const zgPrivateKey = settings.ZEROG_PRIVATE_KEY;
            const filePath = content.object.filePath;
            if (!filePath) {
                console.error("File path is required");
                return false;
            }

            // Check if file exists and is accessible
            try {
                await fs.access(filePath);
            } catch (error) {
                console.error(
                    `File ${filePath} does not exist or is not accessible:`,
                    error
                );
                return false;
            }

            const file = await ZgFile.fromFilePath(filePath);
            var [tree, err] = await file.merkleTree();
            if (err === null) {
                console.log("File Root Hash: ", tree.rootHash());
            } else {
                console.log("Error getting file root hash: ", err);
                return false;
            }

            const provider = new ethers.JsonRpcProvider(zgEvmRpc);
            const signer = new ethers.Wallet(zgPrivateKey, provider);
            const indexer = new Indexer(zgIndexerRpc);

            var [tx, err] = await indexer.upload(file, zgEvmRpc, signer);
            if (err === null) {
                console.log("File uploaded successfully, tx: ", tx);
            } else {
                console.log("Error uploading file: ", err);
            }

            await file.close();

            if (callback) {
                callback({
                    text: `File ${content.object.filePath} uploaded successfully, tx: ${tx}`,
                });
            }
        } catch (error) {
            if (callback) {
                callback({
                    text: `Error uploading file ${content.object.filePath}: ${error}`,
                });
            }
            console.error("Error getting settings for 0G upload:", error);
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
                    text: "uploaded /root/resume.pdf to ZeroG now...",
                    content: {
                        filePath: "/root/resume.pdf",
                    },
                    action: "ZG_UPLOAD",
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
            {
                user: "{{user2}}",
                content: {
                    text: "uploaded ${pwd}/resume.pdf.",
                    content: {
                        filePath: "${pwd}/resume.pdf",
                    },
                    action: "ZG_UPLOAD",
                },
            },
        ]
    ] as ActionExample[][],
} as Action;
