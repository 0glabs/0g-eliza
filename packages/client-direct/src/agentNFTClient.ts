import { verifyMessage, Provider, JsonRpcProvider } from 'ethers';
import fs from 'fs';
import path from 'path';
import { elizaLogger, stringToUuid } from "@elizaos/core";
import { TokenData, AgentMetadata } from './types';
import { AgentNFT } from './contracts/AgentNFT';
import { AgentNFT__factory } from './contracts/factories/AgentNFT__factory';
import { Indexer } from '@0glabs/0g-ts-sdk';

export class AgentNFTClient {
    private provider: Provider;
    private contract: AgentNFT;
    private baseDir: string;
    private rpcURL: string;
    private indexerURL: string;

    constructor(baseDir: string = "") {
        this.baseDir = baseDir;

        this.rpcURL = process.env.ZEROG_RPC_URL;
        this.indexerURL = process.env.ZEROG_INDEXER_RPC_URL;
        const contractAddress = process.env.ZEROG_NFT_CONTRACT_ADDRESS;

        if (!this.rpcURL || !contractAddress || !this.indexerURL) {
            throw new Error("Missing required environment variables: CHAIN_RPC_URL or NFT_CONTRACT_ADDRESS or INDEXER_RPC_URL");
        }
        try {
            this.provider = new JsonRpcProvider(this.rpcURL);
            this.contract = AgentNFT__factory.connect(
                contractAddress,
                this.provider
            );
        } catch (error) {
            elizaLogger.error('Failed to initialize AgentNFTClient:', error);
            throw error;
        }
    }

    async getNFTName(): Promise<string> {
        try {
            const name = await this.contract.name();
            return name;
        } catch (error) {
            elizaLogger.error(`Failed to get NFT name:`, error);
            throw error;
        }
    }

    async getNFTSymbol(): Promise<string> {
        try {
            const symbol = await this.contract.symbol();
            return symbol;
        } catch (error) {
            elizaLogger.error(`Failed to get NFT symbol:`, error);
            throw error;
        }
    }

    async getTokenURI(tokenId: string): Promise<{ rpcURL: string, indexerURL: string }> {
        try {
            const uri = await this.contract.tokenURI(tokenId);
            elizaLogger.info("tokenURI", uri);
            let { chainURL, indexerURL } = JSON.parse(uri);
            return { rpcURL: chainURL, indexerURL };
        } catch (error) {
            elizaLogger.error(`Failed to get token URI for token ${tokenId}:`, error);
            throw error;
        }
    }

    async getTokenData(tokenId: string): Promise<TokenData> {
        try {
            const [owner, dataHashes, dataDescriptions, authorizedUsers] = await Promise.all([
                this.contract.ownerOf(tokenId),
                this.contract.dataHashesOf(tokenId),
                this.contract.dataDescriptionsOf(tokenId),
                this.contract.authorizedUsersOf(tokenId)
            ]);

            return {
                tokenId,
                owner,
                dataHashes,
                dataDescriptions,
                authorizedUsers
            };
        } catch (error) {
            elizaLogger.error(`Failed to fetch token data for token ${tokenId}:`, error);
            throw error;
        }
    }

    async downloadAndSaveData(tokenId: string, dataHashes: string[], dataDescriptions: string[]): Promise<AgentMetadata> {
        if (this.baseDir === "") {
            this.baseDir = path.join("./data", stringToUuid(tokenId));
        }
        const agentMetadata: AgentMetadata = {
            character: path.join(this.baseDir, "character.json"),
            memory: path.join(this.baseDir, "database.sqlite")
        };

        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }

        elizaLogger.info(`Downloading data for token ${tokenId}`);

        try {
            // download data from 0G storage network
            for (const [hash, description] of dataHashes.map((hash, index) => [hash, dataDescriptions[index]])) {
                let descriptionObj = JSON.parse(description);
                if (descriptionObj.type === "Eliza Character") {
                    await this.fetchData(hash, agentMetadata.character);
                }
                if (descriptionObj.type === "Eliza Memory") {
                    await this.fetchData(hash, agentMetadata.memory);
                }
            }
            return agentMetadata;
        } catch (error) {
            elizaLogger.error(`Failed to download and save data for token ${tokenId}:`, error);
            throw error;
        }
    }

    private async fetchData(hash: string, filePath: string) {
        elizaLogger.info(`Fetching data from indexer ${this.indexerURL}`);
        try {
            const indexer = new Indexer(this.indexerURL);
            let err = await indexer.download(hash, filePath, false);
            if (err !== null) {
                elizaLogger.error(`Error indexer downloading file: ${err.message}`);
            }
            elizaLogger.info(`File downloaded successfully to ${filePath}`);
        } catch (err) {
            elizaLogger.error(`Error fetching file: ${err.message}`);
        }
    }
}
