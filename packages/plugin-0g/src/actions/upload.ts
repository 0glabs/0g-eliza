import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    Content,
    ActionExample,
    generateObject,
    elizaLogger,
    ModelProviderName
} from "@elizaos/core";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { Wallet, JsonRpcProvider } from "ethers";
import { composeContext } from "@elizaos/core";
import { promises as fs } from "fs";
import { FileSecurityValidator } from "../utils/security";
import { logSecurityEvent, monitorUpload, monitorFileValidation, monitorCleanup } from '../utils/monitoring';
import { uploadTemplate } from "../templates/upload";
import { z } from 'zod';


export interface UploadContent extends Content {
    filePath: string;
}

const UploadSchema = z.object({
    filePath: z.string(),
    description: z.string(),
});

export const isUploadContent = (object: any): object is UploadContent => {
    if (UploadSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};

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
        elizaLogger.debug("Starting ZG_UPLOAD validation", { messageId: message.id });

        try {
            const settings = {
                indexerRpc: runtime.getSetting("ZEROG_INDEXER_RPC_URL"),
                evmRpc: runtime.getSetting("ZEROG_RPC_URL"),
                privateKey: runtime.getSetting("ZEROG_PRIVATE_KEY")
            };

            elizaLogger.debug("Checking ZeroG settings", {
                hasIndexerRpc: Boolean(settings.indexerRpc),
                hasEvmRpc: Boolean(settings.evmRpc),
                hasPrivateKey: Boolean(settings.privateKey)
            });

            const hasRequiredSettings = Object.entries(settings).every(([key, value]) => Boolean(value));

            if (!hasRequiredSettings) {
                const missingSettings = Object.entries(settings)
                    .filter(([_, value]) => !value)
                    .map(([key]) => key);

                elizaLogger.error("Missing required ZeroG settings", {
                    missingSettings,
                    messageId: message.id
                });
                return false;
            }

            const config = {
                maxFileSize: parseInt(runtime.getSetting("ZEROG_MAX_FILE_SIZE") || "10485760"),
                allowedExtensions: runtime.getSetting("ZEROG_ALLOWED_EXTENSIONS")?.split(",") || [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx"],
                uploadDirectory: runtime.getSetting("ZEROG_UPLOAD_DIR") || "/tmp/zerog-uploads",
                enableVirusScan: runtime.getSetting("ZEROG_ENABLE_VIRUS_SCAN") === "true"
            };

            // Validate config values
            if (isNaN(config.maxFileSize) || config.maxFileSize <= 0) {
                elizaLogger.error("Invalid ZEROG_MAX_FILE_SIZE setting", {
                    value: runtime.getSetting("ZEROG_MAX_FILE_SIZE"),
                    messageId: message.id
                });
                return false;
            }

            if (!config.allowedExtensions || config.allowedExtensions.length === 0) {
                elizaLogger.error("Invalid ZEROG_ALLOWED_EXTENSIONS setting", {
                    value: runtime.getSetting("ZEROG_ALLOWED_EXTENSIONS"),
                    messageId: message.id
                });
                return false;
            }

            elizaLogger.info("ZG_UPLOAD action settings validated", {
                config,
                messageId: message.id
            });
            return true;
        } catch (error) {
            elizaLogger.error("Error validating ZG_UPLOAD settings", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                messageId: message.id
            });
            return false;
        }
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.info("ZG_UPLOAD action started", {
            messageId: message.id,
            hasState: Boolean(state),
            hasCallback: Boolean(callback)
        });

        let file: ZgFile | undefined;
        let cleanupRequired = false;

        try {
            // Update state if needed
            if (!state) {
                elizaLogger.debug("No state provided, composing new state");
                state = (await runtime.composeState(message)) as State;
            } else {
                elizaLogger.debug("Updating existing state");
                state = await runtime.updateRecentMessageState(state);
            }

            // Compose upload context
            elizaLogger.debug("Composing upload context");
            const uploadContext = composeContext({
                state,
                template: uploadTemplate,
            });

            // Generate upload content
            elizaLogger.debug("Generating upload content");
            let content = await generateObject({
                runtime,
                context: uploadContext,
                modelClass: ModelClass.LARGE,
                schema: UploadSchema,
            });
            let object;
            // Validate upload content
            if (runtime.modelProvider !== ModelProviderName.ZERO_G) {
                object = content.object;
            } else {
                object = content;
            }
            if (!isUploadContent(object)) {
                const error = "Invalid content for UPLOAD action";
                elizaLogger.error(error, {
                    content,
                    messageId: message.id
                });
                if (callback) {
                    callback({
                        text: "Unable to process 0G upload request. Invalid content provided.",
                        content: { error }
                    });
                }
                return false;
            }

            const filePath = object.filePath;
            elizaLogger.debug("Extracted file path", { filePath, content });

            if (!filePath) {
                const error = "File path is required";
                elizaLogger.error(error, { messageId: message.id });
                if (callback) {
                    callback({
                        text: "File path is required for upload.",
                        content: { error }
                    });
                }
                return false;
            }

            // Initialize security validator
            const securityConfig = {
                maxFileSize: parseInt(runtime.getSetting("ZEROG_MAX_FILE_SIZE") || "10485760"),
                allowedExtensions: runtime.getSetting("ZEROG_ALLOWED_EXTENSIONS")?.split(",") || [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx"],
                uploadDirectory: runtime.getSetting("ZEROG_UPLOAD_DIR") || "/tmp/zerog-uploads",
                enableVirusScan: runtime.getSetting("ZEROG_ENABLE_VIRUS_SCAN") === "true"
            };

            let validator: FileSecurityValidator;
            try {
                elizaLogger.debug("Initializing security validator", {
                    config: securityConfig,
                    messageId: message.id
                });
                validator = new FileSecurityValidator(securityConfig);
            } catch (error) {
                const errorMessage = `Security validator initialization failed: ${error instanceof Error ? error.message : String(error)}`;
                elizaLogger.error(errorMessage, {
                    config: securityConfig,
                    messageId: message.id
                });
                if (callback) {
                    callback({
                        text: "Upload failed: Security configuration error.",
                        content: { error: errorMessage }
                    });
                }
                return false;
            }

            // Validate file type
            elizaLogger.debug("Starting file type validation", { filePath });
            const typeValidation = await validator.validateFileType(filePath);
            monitorFileValidation(filePath, "file_type", typeValidation.isValid, {
                error: typeValidation.error
            });
            if (!typeValidation.isValid) {
                const error = "File type validation failed";
                elizaLogger.error(error, {
                    error: typeValidation.error,
                    filePath,
                    messageId: message.id
                });
                if (callback) {
                    callback({
                        text: `Upload failed: ${typeValidation.error}`,
                        content: { error: typeValidation.error }
                    });
                }
                return false;
            }

            // Validate file size
            elizaLogger.debug("Starting file size validation", { filePath });
            const sizeValidation = await validator.validateFileSize(filePath);
            monitorFileValidation(filePath, "file_size", sizeValidation.isValid, {
                error: sizeValidation.error
            });
            if (!sizeValidation.isValid) {
                const error = "File size validation failed";
                elizaLogger.error(error, {
                    error: sizeValidation.error,
                    filePath,
                    messageId: message.id
                });
                if (callback) {
                    callback({
                        text: `Upload failed: ${sizeValidation.error}`,
                        content: { error: sizeValidation.error }
                    });
                }
                return false;
            }

            // Validate file path
            elizaLogger.debug("Starting file path validation", { filePath });
            const pathValidation = await validator.validateFilePath(filePath);
            monitorFileValidation(filePath, "file_path", pathValidation.isValid, {
                error: pathValidation.error
            });
            if (!pathValidation.isValid) {
                const error = "File path validation failed";
                elizaLogger.error(error, {
                    error: pathValidation.error,
                    filePath,
                    messageId: message.id
                });
                if (callback) {
                    callback({
                        text: `Upload failed: ${pathValidation.error}`,
                        content: { error: pathValidation.error }
                    });
                }
                return false;
            }

            // Sanitize the file path
            let sanitizedPath: string;
            try {
                sanitizedPath = validator.sanitizePath(filePath);
                elizaLogger.debug("File path sanitized", {
                    originalPath: filePath,
                    sanitizedPath,
                    messageId: message.id
                });
            } catch (error) {
                const errorMessage = `Failed to sanitize file path: ${error instanceof Error ? error.message : String(error)}`;
                elizaLogger.error(errorMessage, {
                    filePath,
                    messageId: message.id
                });
                if (callback) {
                    callback({
                        text: "Upload failed: Invalid file path.",
                        content: { error: errorMessage }
                    });
                }
                return false;
            }

            // Start upload monitoring
            const startTime = Date.now();
            let fileStats;
            try {
                fileStats = await fs.stat(sanitizedPath);
                elizaLogger.debug("File stats retrieved", {
                    size: fileStats.size,
                    path: sanitizedPath,
                    created: fileStats.birthtime,
                    modified: fileStats.mtime,
                    messageId: message.id
                });
            } catch (error) {
                const errorMessage = `Failed to get file stats: ${error instanceof Error ? error.message : String(error)}`;
                elizaLogger.error(errorMessage, {
                    path: sanitizedPath,
                    messageId: message.id
                });
                if (callback) {
                    callback({
                        text: "Upload failed: Could not access file",
                        content: { error: errorMessage }
                    });
                }
                return false;
            }

            try {
                // Initialize ZeroG file
                elizaLogger.debug("Initializing ZeroG file", {
                    sanitizedPath,
                    messageId: message.id
                });
                file = await ZgFile.fromFilePath(sanitizedPath);
                cleanupRequired = true;

                // Generate Merkle tree
                elizaLogger.debug("Generating Merkle tree");
                const [merkleTree, merkleError] = await file.merkleTree();
                if (merkleError !== null) {
                    const error = `Error getting file root hash: ${merkleError instanceof Error ? merkleError.message : String(merkleError)}`;
                    elizaLogger.error(error, { messageId: message.id });
                    if (callback) {
                        callback({
                            text: "Upload failed: Error generating file hash.",
                            content: { error }
                        });
                    }
                    return false;
                }
                elizaLogger.info("File root hash generated", {
                    rootHash: merkleTree.rootHash(),
                    messageId: message.id
                });

                // Initialize blockchain connection
                elizaLogger.debug("Initializing blockchain connection");
                const provider = new JsonRpcProvider(runtime.getSetting("ZEROG_RPC_URL"));
                const signer = new Wallet(runtime.getSetting("ZEROG_PRIVATE_KEY"), provider);
                const indexer = new Indexer(runtime.getSetting("ZEROG_INDEXER_RPC_URL"));

                const { gasPrice } = await provider.getFeeData();
                elizaLogger.info(`current average gasPrice: ${gasPrice}, using: ${BigInt(Math.round(Number(gasPrice) * 10))}`);

                // Upload file to ZeroG
                elizaLogger.info("Starting file upload to ZeroG", {
                    filePath: sanitizedPath,
                    messageId: message.id
                });
                const [txHash, uploadError] = await indexer.upload(file, runtime.getSetting("ZEROG_RPC_URL"), signer, undefined, {
                    Retries: 3,
                    Interval: 1000,
                    MaxGasPrice: Math.round(Number(gasPrice) * 20) ?? undefined
                }, {
                    gasPrice: BigInt(Math.round(Number(gasPrice) * 10)) ?? undefined
                });

                if (uploadError !== null) {
                    const error = `Error uploading file: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`;
                    elizaLogger.error(error, { messageId: message.id });
                    monitorUpload({
                        filePath: sanitizedPath,
                        size: fileStats.size,
                        duration: Date.now() - startTime,
                        success: false,
                        error: error
                    });
                    if (callback) {
                        callback({
                            text: "Upload failed: Error during file upload.",
                            content: { error }
                        });
                    }
                    return false;
                }

                // Log successful upload
                monitorUpload({
                    filePath: sanitizedPath,
                    size: fileStats.size,
                    duration: Date.now() - startTime,
                    success: true
                });

                elizaLogger.info("File uploaded successfully", {
                    transactionHash: txHash,
                    filePath: sanitizedPath,
                    fileSize: fileStats.size,
                    duration: Date.now() - startTime,
                    messageId: message.id
                });

                if (callback) {
                    callback({
                        text: "File uploaded successfully to ZeroG.",
                        content: {
                            success: true,
                            transactionHash: txHash
                        }
                    });
                }

                return true;
            } finally {
                // Cleanup temporary file
                if (cleanupRequired && file) {
                    try {
                        elizaLogger.debug("Starting file cleanup", {
                            filePath: sanitizedPath,
                            messageId: message.id
                        });
                        await file.close();
                        await fs.unlink(sanitizedPath);
                        monitorCleanup(sanitizedPath, true);
                        elizaLogger.debug("File cleanup completed successfully", {
                            filePath: sanitizedPath,
                            messageId: message.id
                        });
                    } catch (cleanupError) {
                        monitorCleanup(sanitizedPath, false, cleanupError.message);
                        elizaLogger.warn("Failed to cleanup file", {
                            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                            filePath: sanitizedPath,
                            messageId: message.id
                        });
                    }
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logSecurityEvent("Unexpected error in upload action", "high", {
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
                messageId: message.id
            });

            elizaLogger.error("Unexpected error during file upload", {
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
                messageId: message.id
            });

            if (callback) {
                callback({
                    text: "Upload failed due to an unexpected error.",
                    content: { error: errorMessage }
                });
            }

            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload my resume.pdf file",
                    action: "ZG_UPLOAD",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "can you help me upload this document.docx?",
                    action: "ZG_UPLOAD",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I need to upload an image file image.png",
                    action: "ZG_UPLOAD",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
