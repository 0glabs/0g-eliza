import { DirectClient } from "@elizaos/client-direct";
import { Character, defaultCharacter, elizaLogger, settings } from "@elizaos/core";
import {
    parseArguments,
    loadCharacters,
    startAgent,
    checkPortAvailable,
    loadFromNFT
} from "./agent";

export const startAgents = async () => {
    const directClient = new DirectClient();
    let serverPort = parseInt(settings.SERVER_PORT || "3000");
    const args = parseArguments();
    let characters: Character[] = [];

    try {
        if (args.characters || args.character) {
            // load from local config
            elizaLogger.info("Starting in local config mode...");
            characters = await loadCharacters(args.characters || args.character);
        } else if (args.token) {
            // load from nft
            elizaLogger.info("Starting in NFT mode...");
            characters = await loadFromNFT(args.token);
        } else {
            // load from default character
            elizaLogger.info("Starting with default character...");
            characters = [defaultCharacter];
        }

        // check port available
        while (!(await checkPortAvailable(serverPort))) {
            elizaLogger.warn(`Port ${serverPort} is in use, trying ${serverPort + 1}`);
            serverPort++;
        }

        for (const character of characters) {
            await startAgent(character, directClient);
        }

        directClient.startAgent = async (character: Character) => {
            return startAgent(character, directClient);
        };

        directClient.start(serverPort);

        if (serverPort !== parseInt(settings.SERVER_PORT || "3000")) {
            elizaLogger.log(`Server started on alternate port ${serverPort}`);
        }

        elizaLogger.success("All agents started successfully!");
        elizaLogger.log(
            "Run `pnpm start:client` to start the client and visit the outputted URL " +
            `(http://localhost:${serverPort}) to chat with your agents.`
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