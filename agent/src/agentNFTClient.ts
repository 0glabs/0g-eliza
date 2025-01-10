import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { elizaLogger, stringToUuid } from "@elizaos/core";
import { TokenData, AgentMetadata } from './types';
import { AgentNFT } from './contracts/AgentNFT';
import { AgentNFT__factory } from './contracts/factories/AgentNFT__factory';
import { Indexer } from '@0glabs/0g-ts-sdk';

const NUM_AGENT_HASHES = 2;

export class AgentNFTClient {
    private provider: ethers.Provider;
    private signer?: ethers.Signer;
    private contract: AgentNFT;
    private baseDir: string;
    private chainURL: string;
    private indexerURL: string;

    constructor(baseDir: string = "./data") {
        elizaLogger.info("AgentNFTClient constructor");
        this.baseDir = baseDir;

        const rpcUrl = process.env.ZEROG_RPC_URL;
        const privateKey = process.env.ZEROG_PRIVATE_KEY;
        const contractAddress = process.env.ZEROG_NFT_CONTRACT_ADDRESS;

        if (!rpcUrl || !contractAddress || !privateKey) {
            throw new Error("Missing required environment variables: CHAIN_RPC_URL or NFT_CONTRACT_ADDRESS or PRIVATE_KEY");
        }
        try {
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            this.signer = new ethers.Wallet(privateKey, this.provider);
            this.contract = AgentNFT__factory.connect(
                contractAddress,
                this.signer
            );
        } catch (error) {
            elizaLogger.error('Failed to initialize AgentNFTClient:', error);
            throw error;
        }
    }

    async getNFTName(): Promise<string> {
        const name = await this.contract.name();
        return name;
    }

    async getNFTSymbol(): Promise<string> {
        const symbol = await this.contract.symbol();
        return symbol;
    }

    async getTokenURI(tokenId: string): Promise<{ chainURL: string, indexerURL: string }> {
        const uri = await this.contract.tokenURI(tokenId);
        let [chainURL, indexerURL] = uri.split("\n");
        this.chainURL = chainURL.replace("chainURL: ", "");
        this.indexerURL = indexerURL.replace("indexerURL: ", "");
        return { chainURL, indexerURL };
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

    async validateToken(tokenData: TokenData): Promise<boolean> {
        try {
            const tokenOwner = tokenData.owner.toLowerCase();
            const tokenOwnerPrivateKey = process.env.ZEROG_PRIVATE_KEY?.toLowerCase();
            const claimedTokenOwner = new ethers.Wallet(tokenOwnerPrivateKey).address.toLowerCase();
            if (tokenOwner === claimedTokenOwner) {
                return true;
            } else {
                elizaLogger.error(`Token ${tokenData.tokenId} is not owned by ${claimedTokenOwner}, token owner is ${tokenOwner}`);
                return false;
            }
        } catch (error) {
            elizaLogger.error(`Error when validating token ${tokenData.tokenId}:`, error);
            return false;
        }
    }

    async downloadAndSaveData(tokenId: string, dataHashes: string[], dataDescriptions: string[]): Promise<AgentMetadata> {
        const tokenDir = path.join(this.baseDir, stringToUuid(tokenId));
        const agentMetadata: AgentMetadata = {
            character: path.join(tokenDir, "character.json"),
            memory: path.join(tokenDir, "database.sqlite")
        };

        if (!fs.existsSync(tokenDir)) {
            fs.mkdirSync(tokenDir, { recursive: true });
        }

        if (dataHashes.length !== NUM_AGENT_HASHES || dataDescriptions.length !== NUM_AGENT_HASHES) {
            throw new Error(`Expected ${NUM_AGENT_HASHES} data hashes and descriptions, got ${dataHashes.length} hashes and ${dataDescriptions.length} descriptions`);
        }

        try {
            // download data from 0G storage network
            for (const [hash, description] of dataHashes.map((hash, index) => [hash, dataDescriptions[index]])) {
                if (description === "eliza_character") {
                    await this.fetchData(hash, agentMetadata.character);
                }
                if (description === "eliza_memory") {
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
        } catch (err) {
            elizaLogger.error(`Error fetching file: ${err.message}`);
        }
    }
}