import { elizaLogger } from "@elizaos/core";
import { AgentNFTClient } from "./agentNFTClient";
import { parseArguments } from "./agent";

const generateNFT = async () => {
    elizaLogger.info("Generating NFT");
    try {
        const args = parseArguments();
        const agentNFTClient = new AgentNFTClient(args.dir);
        await agentNFTClient.generateAgentNFT();
    } catch (error) {
        throw error;
    }
};

generateNFT().catch((error) => {
    elizaLogger.error("Unhandled error in generateNFT:", error);
    process.exit(1);
});