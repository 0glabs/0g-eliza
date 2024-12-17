import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    ActionExample,
    generateObjectV2,
    elizaLogger,
} from "@ai16z/eliza";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";
import { composeContext, settings } from "@ai16z/eliza";
import { promises as fs } from "fs";

import { zgsExtractFilePathTemplate } from "../../templates/storage/extract_file_path";
import { FilePathSchema, isFilePathContent } from "../../types";
import { validateZeroGConfig } from "../../enviroment";

export const zgsDownload: Action = {
    name: "ZGS_DOWNLOAD",
    similes: [
        "DOWNLOAD_FILE_FROM_ZG",
        "DOWNLOAD_FILE_FROM_ZERO_GRAVITY",
        "DOWNLOAD_FILE_FROM_ZERO_GRAVITY_STORAGE",
    ],
    description: "Download data using 0G protocol",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // console.log("Validating download from user:", message.userId);
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        console.log("ZGS_DOWNLOAD action called");
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
        const downloadContext = composeContext({
            state,
            template: promptTemplate,
        });
        elizaLogger.debug("Download context:", downloadContext);
        // Generate download content
        const content = await generateObjectV2({
            runtime,
            context: downloadContext,
            modelClass: ModelClass.SMALL,
            schema: FilePathSchema,
        });

        // Validate download content
        if (!isFilePathContent(content.object)) {
            throw new Error("Invalid content");
        }

        const zgConfig = await validateZeroGConfig(runtime);

        try {
            const zgIndexerRpc = zgConfig.ZEROG_INDEXER_RPC_URL;
            elizaLogger.log("Indexer rpc url:", zgIndexerRpc);
            if (!content.object.rootHash) {
                throw new Error("Root hash is required when downloading a file");
            }

            const indexer = new Indexer(zgIndexerRpc);
            elizaLogger.log("Downloading file content:", content.object);

            const err = await indexer.download(content.object.rootHash, content.object.filePath, true);
            if (err !== null) {
                elizaLogger.error("Error downloading file:", err);
                return false;
            }

            if (callback) {
                callback({
                    text: `Downloaded ${content.object.filePath} from zero gravity storage successfully`,
                });
            }
        } catch (error) {
            if (callback) {
                callback({
                    text: `Error downloading file ${content.object.filePath}: ${error}`,
                });
            }
            elizaLogger.error("Error downloading file:", error);
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "download /root/resume.pdf with root hash 0x1234567890 from ZeroG",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "download file with root hash 0x1234567890 from ZeroG as resume.pdf under current directory",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "download file with root hash 0x1234567890 from Zero Gravity as resume.pdf under current directory",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "download file with root hash 0x1234567890 from Zero Gravity as resume.pdf",
                },
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "download file with root hash 0x1234567890 from Zero Gravity as /root/resume.pdf",
                },
            }
        ]
    ] as ActionExample[][],
} as Action;
