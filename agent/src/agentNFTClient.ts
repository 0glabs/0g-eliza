import { ethers, toUtf8Bytes } from 'ethers';
import fs from 'fs';
import path from 'path';
import { elizaLogger, stringToUuid } from "@elizaos/core";
import { TokenData, AgentMetadata } from './types';
import { AgentNFT } from './contracts/AgentNFT';
import { AgentNFT__factory } from './contracts/factories/AgentNFT__factory';
import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';

const NUM_AGENT_HASHES = 2;

export class AgentNFTClient {
    private provider: ethers.Provider;
    private signer?: ethers.Wallet;
    private contract: AgentNFT;
    private baseDir: string;
    private rpcURL: string;
    private indexerURL: string;

    constructor(baseDir: string = "") {
        this.baseDir = baseDir;

        this.rpcURL = process.env.ZEROG_RPC_URL;
        this.indexerURL = process.env.ZEROG_INDEXER_RPC_URL;

        const privateKey = process.env.ZEROG_PRIVATE_KEY;
        const contractAddress = process.env.ZEROG_NFT_CONTRACT_ADDRESS;

        if (!this.rpcURL || !contractAddress || !privateKey || !this.indexerURL) {
            throw new Error("Missing required environment variables: CHAIN_RPC_URL or NFT_CONTRACT_ADDRESS or PRIVATE_KEY or INDEXER_RPC_URL");
        }
        try {
            this.provider = new ethers.JsonRpcProvider(this.rpcURL);
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
            let [rpcURL, indexerURL] = uri.split("\n");
            this.rpcURL = rpcURL.replace("rpcURL: ", "");
            this.indexerURL = indexerURL.replace("indexerURL: ", "");
            return { rpcURL, indexerURL };
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

    async mintToken(proofs: string[], dataDescriptions: string[]): Promise<string> {
        try {
            const tx = await this.contract.mint(proofs, dataDescriptions);
            const receipt = await tx.wait();
            const mintEvent = receipt?.logs
                .map(log => {
                    try {
                        return this.contract.interface.parseLog(log);
                    } catch (e) {
                        return null;
                    }
                })
                .find(event => event?.name === 'Minted');

            if (!mintEvent) {
                throw new Error('Minted event not found in transaction receipt');
            }

            const tokenId = mintEvent.args[0];
            return tokenId.toString();
        } catch (error) {
            elizaLogger.error(`Failed to mint token:`, error);
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

        if (dataHashes.length !== NUM_AGENT_HASHES || dataDescriptions.length !== NUM_AGENT_HASHES) {
            throw new Error(`Expected ${NUM_AGENT_HASHES} data hashes and descriptions, got ${dataHashes.length} hashes and ${dataDescriptions.length} descriptions`);
        }

        elizaLogger.info(`Downloading data for token ${tokenId}`);

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
            elizaLogger.info(`File downloaded successfully to ${filePath}`);
        } catch (err) {
            elizaLogger.error(`Error fetching file: ${err.message}`);
        }
    }

    private async uploadData(filePath: string): Promise<{ tx: string, root: string }> {
        try{
            elizaLogger.info(`Uploading data to indexer ${this.indexerURL}`);
            const indexer = new Indexer(this.indexerURL);
            if (!process.env.ZEROG_PRIVATE_KEY) {
                throw new Error("Missing required environment variables: ZEROG_PRIVATE_KEY");
            }

            const file = await ZgFile.fromFilePath(filePath);
            var [tree, err] = await file.merkleTree();
            var root = tree.rootHash();
            if (err === null) {
                elizaLogger.info("Data root hash:", root);
            } else {
                elizaLogger.error("Error generating data root hash");
            }
            var [tx, err] = await indexer.upload(file, this.rpcURL, this.signer);
            if (err !== null) {
                if (err.message.includes("Data already exists")) {
                    elizaLogger.info("Data already exists in storage network, skipping upload");
                } else {
                    elizaLogger.error(`Error indexer uploading file: ${err.message}`);
                }
            }
            elizaLogger.info("Data uploaded to storage network successfully");
            return { tx, root };
        } catch (error) {
            elizaLogger.error(`Error uploading data ${filePath} to storage network: ${error.message}`);
        }
    }

    private async generateOwnershipProof(preimages: string[], claimedHashes: string[]): Promise<string[]> {

        // TODO: generate proof using preimage and claimedHash, now just return the claimedHash as public input
        return claimedHashes;
    }

    async generateAgentNFT(): Promise<string> {
        try {
            if (this.baseDir === "") {
                elizaLogger.error("Base directory not set");
                throw new Error("Base directory not set");
            }

            const agentMetadata: AgentMetadata = {
                character: path.join(this.baseDir, "character.json"),
                memory: path.join(this.baseDir, "database.sqlite")
            };

            if (!fs.existsSync(agentMetadata.character) || !fs.existsSync(agentMetadata.memory)) {
                elizaLogger.error("Agent metadata files do not exist");
                throw new Error("Agent metadata files do not exist");
            }

            // upload data to storage network
            const { tx: _characterTx, root: characterRoot } = await this.uploadData(agentMetadata.character);
            const { tx: _memoryTx, root: memoryRoot } = await this.uploadData(agentMetadata.memory);

            // generate ownership proof
            const proofs = await this.generateOwnershipProof(["preimage1", "preimage2"], [characterRoot, memoryRoot]);

            // create agent NFT
            const tokenId = await this.mintToken(proofs, ["eliza_character", "eliza_memory"]);
            // const tokenData = await this.getTokenData(tokenId);
            elizaLogger.info(`Agent NFT created successfully, token ID: ${tokenId}`);
            return tokenId;
        } catch (error) {
            elizaLogger.error("Error creating agent NFT:", error);
            throw error;
        }
    }
}
