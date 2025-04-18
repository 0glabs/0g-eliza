import { DirectClient } from "@elizaos/client-direct";
import { defaultCharacter, elizaLogger, settings } from "@elizaos/core";
import {
    parseArguments,
    loadCharacters,
    startAgent,
    checkPortAvailable,
    loadFromNFT,
    handlePluginImporting
} from "./agent";

export const startAgents = async () => {
    const directClient = new DirectClient();
    let serverPort = parseInt(settings.SERVER_PORT || "3000");
    const args = parseArguments();
    let charactersArg = args.characters || args.character;
    let characters = [];

    try {
        if (charactersArg) {
            elizaLogger.info("Starting in local config mode...");
            characters = await loadCharacters(charactersArg);
        } else if (args.token) {
            // load from nft
            elizaLogger.info("Starting in NFT mode...");
            characters = await loadFromNFT(args.token, args.proof, args.dir);
        } else {
            // load from default character
            elizaLogger.info("Starting with default character...");
            characters = [];
        }

        // Find available port
        while (!(await checkPortAvailable(serverPort))) {
            elizaLogger.warn(
                `Port ${serverPort} is in use, trying ${serverPort + 1}`
            );
            serverPort++;
        }

        // upload some agent functionality into directClient
        directClient.startAgent = async (character) => {
            // Handle plugins
            character.plugins = await handlePluginImporting(character.plugins);

            // wrap it so we don't have to inject directClient later
            return startAgent(character, directClient);
        };

        for (const character of characters) {
            const agent = await directClient.startAgent(character);
            elizaLogger.info(`Agent ${character.name} started with ID: ${agent.agentId}`);
        }

        directClient.start(serverPort);

        if (serverPort !== parseInt(settings.SERVER_PORT || "3000")) {
            elizaLogger.log(`Server started on alternate port ${serverPort}`);
        }

        elizaLogger.log(
            "Run `pnpm start:client` to start the client and visit the outputted URL (http://localhost:5173) to chat with your agents. When running multiple agents, use client with different port `SERVER_PORT=3001 pnpm start:client`"
        );

    } catch (error) {
        elizaLogger.error("Failed to start agents:", error);
        throw error;
    }
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1);
});
