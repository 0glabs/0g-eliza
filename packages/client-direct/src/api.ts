import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import {
    AgentRuntime,
    elizaLogger,
    getEnvVariable,
    UUID,
    validateCharacterConfig,
    ServiceType,
    stringToUuid,
} from "@elizaos/core";

import { TeeLogQuery, TeeLogService } from "@elizaos/plugin-tee-log";
import { REST, Routes } from "discord.js";
import { DirectClient } from ".";
import { validateUuid } from "@elizaos/core";
import { AgentNFTClient } from "./agentNFTClient";
import fs from "fs/promises";

interface UUIDParams {
    agentId: UUID;
    roomId?: UUID;
}

function validateUUIDParams(
    params: { agentId: string; roomId?: string },
    res: express.Response
): UUIDParams | null {
    const agentId = validateUuid(params.agentId);
    if (!agentId) {
        res.status(400).json({
            error: "Invalid AgentId format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        });
        return null;
    }

    if (params.roomId) {
        const roomId = validateUuid(params.roomId);
        if (!roomId) {
            res.status(400).json({
                error: "Invalid RoomId format. Expected to be a UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            });
            return null;
        }
        return { agentId, roomId };
    }

    return { agentId };
}

export function createApiRouter(
    agents: Map<string, AgentRuntime>,
    directClient: DirectClient
) {
    const router = express.Router();

    router.use(cors());
    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: true }));
    router.use(
        express.json({
            limit: getEnvVariable("EXPRESS_MAX_PAYLOAD") || "100kb",
        })
    );

    router.get("/", (req, res) => {
        res.send("Welcome, this is the REST API!");
    });

    router.get("/hello", (req, res) => {
        res.json({ message: "Hello World!" });
    });

    router.get("/agents", (req, res) => {
        const agentsList = Array.from(agents.values()).map((agent) => ({
            id: agent.agentId,
            name: agent.character.name,
            clients: Object.keys(agent.clients),
        }));
        res.json({ agents: agentsList });
    });

    router.get("/agents/:agentId", (req, res) => {
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;

        const agent = agents.get(agentId);

        if (!agent) {
            res.status(404).json({ error: "Agent not found" });
            return;
        }

        const character = agent?.character;
        if (character?.settings?.secrets) {
            delete character.settings.secrets;
        }

        res.json({
            id: agent.agentId,
            character: agent.character,
        });
    });

    router.post("/agents/:agentId/set", async (req, res) => {
        elizaLogger.info(`Reset agent start`);
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;

        let agent: AgentRuntime = agents.get(agentId);

        // update character
        if (agent) {
            // stop agent
            agent.stop();
            directClient.unregisterAgent(agent);
            // if it has a different name, the agentId will change
        }
        elizaLogger.info(`Old agent ${agentId} stopped`);
        // load character from body
        // {tokenId: string, proof: string, character: string}
        elizaLogger.info(`New agent with tokenId: ${req.body.tokenId} start`);
        let { tokenId, character } = req.body;
        if (character) { // character is provided
            try {
                validateCharacterConfig(character);
            } catch (e) {
                elizaLogger.error(`Error parsing character: ${e}`);
                res.status(400).json({
                    success: false,
                    message: e.message,
                });
                return;
            }
        } else if (tokenId) { // get character from tokenId
            const agentNFTClient = new AgentNFTClient();
            const name = await agentNFTClient.getNFTName();
            elizaLogger.info(`NFT name: ${name}`);
            const symbol = await agentNFTClient.getNFTSymbol();
            elizaLogger.info(`NFT symbol: ${symbol}`);
            const { rpcURL, indexerURL } = await agentNFTClient.getTokenURI(tokenId);
            elizaLogger.info(`Rpc URL: ${rpcURL}`);
            elizaLogger.info(`Indexer URL: ${indexerURL}`);

            elizaLogger.info(`Fetching data for token[${tokenId}] from ${indexerURL}...`);
            const tokenData = await agentNFTClient.getTokenData(tokenId);
            elizaLogger.info(`tokenData: ${JSON.stringify(tokenData)}`);

            elizaLogger.info("Downloading and saving token data...");
            const agentMetadata = await agentNFTClient.downloadAndSaveData(tokenId, tokenData.dataHashes, tokenData.dataDescriptions);
            elizaLogger.info("agentMetadata", agentMetadata);
            process.env.SQLITE_FILE = agentMetadata.memory;

            character = await fs.readFile(agentMetadata.character, "utf-8");
            character = JSON.parse(character);
            elizaLogger.info(`character: ${character}`);

            try {
                validateCharacterConfig(character);
            } catch (e) {
                elizaLogger.error(`Error parsing character: ${e}`);
                res.status(400).json({
                    success: false,
                    message: e.message,
                });
                return;
            }
        } else {
            res.status(400).json({
                success: false,
                message: "No character or tokenId and proof provided",
            });
            return;
        }

        // start it up (and register it)
        agent = await directClient.startAgent(character);
        elizaLogger.log(`${character.name} started`);

        res.json({
            id: character.id,
            character: character,
        });
    });

    router.post("/agents/:agentId/delete", async (req, res) => {
        elizaLogger.info(`Delete agent start`);
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;
        elizaLogger.info(`Delete agent ${agentId}`);
        let agent: AgentRuntime = agents.get(agentId);

        if (agent) {
            // stop agent
            agent.stop();
            directClient.unregisterAgent(agent);
        }

        res.json({
            id: agent.agentId,
            success: true,
        });
    });

    router.get("/agents/:agentId/channels", async (req, res) => {
        const { agentId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
        };
        if (!agentId) return;

        const runtime = agents.get(agentId);

        if (!runtime) {
            res.status(404).json({ error: "Runtime not found" });
            return;
        }

        const API_TOKEN = runtime.getSetting("DISCORD_API_TOKEN") as string;
        const rest = new REST({ version: "10" }).setToken(API_TOKEN);

        try {
            const guilds = (await rest.get(Routes.userGuilds())) as Array<any>;

            res.json({
                id: runtime.agentId,
                guilds: guilds,
                serverCount: guilds.length,
            });
        } catch (error) {
            console.error("Error fetching guilds:", error);
            res.status(500).json({ error: "Failed to fetch guilds" });
        }
    });

    router.get("/agents/:agentId/:roomId/memories", async (req, res) => {
        const { agentId, roomId } = validateUUIDParams(req.params, res) ?? {
            agentId: null,
            roomId: null,
        };
        if (!agentId || !roomId) return;

        let runtime = agents.get(agentId);

        // if runtime is null, look for runtime with the same name
        if (!runtime) {
            runtime = Array.from(agents.values()).find(
                (a) => a.character.name.toLowerCase() === agentId.toLowerCase()
            );
        }

        if (!runtime) {
            res.status(404).send("Agent not found");
            return;
        }

        try {
            const memories = await runtime.messageManager.getMemories({
                roomId,
                count: 20,
                unique: false,
            });
            const response = {
                agentId,
                roomId,
                memories: memories.map((memory) => ({
                    id: memory.id,
                    userId: memory.userId,
                    agentId: memory.agentId,
                    createdAt: memory.createdAt,
                    content: {
                        text: memory.content.text,
                        action: memory.content.action,
                        source: memory.content.source,
                        url: memory.content.url,
                        inReplyTo: memory.content.inReplyTo,
                        attachments: memory.content.attachments?.map(
                            (attachment) => ({
                                id: attachment.id,
                                url: attachment.url,
                                title: attachment.title,
                                source: attachment.source,
                                description: attachment.description,
                                text: attachment.text,
                                contentType: attachment.contentType,
                            })
                        ),
                    },
                    embedding: memory.embedding,
                    roomId: memory.roomId,
                    unique: memory.unique,
                    similarity: memory.similarity,
                })),
            };

            res.json(response);
        } catch (error) {
            console.error("Error fetching memories:", error);
            res.status(500).json({ error: "Failed to fetch memories" });
        }
    });

    router.get("/agents/:agentId/chat-history", async (req, res) => {
        elizaLogger.log("Fetching chat history");

        const { agentId } = validateUUIDParams(req.params, res) ?? { agentId: null };
        if (!agentId) {
            res.status(400).json({ error: "Agent ID is required" });
            return;
        }

        const runtime = agents.get(agentId);
        if (!runtime) {
            res.status(404).json({ error: "Agent not found" });
            return;
        }

        const roomId = stringToUuid(req.query.roomId as string ?? "default-room-" + agentId);
        elizaLogger.log("Fetching chat history for roomId:", roomId);

        const cursor = req.query.cursor as UUID;
        const pageSize = parseInt(req.query.pageSize as string) || 5;

        elizaLogger.log("Page size:", pageSize);
        elizaLogger.log("Cursor:", cursor || "Not provided");

        const totalCount = await runtime.messageManager.countMemories(roomId, false);
        elizaLogger.log("Total count of memories:", totalCount);
        let page = [];
        let pageWithNextCursor = [];
        let nextCursor = null;
        try {
            if (cursor) {
                const startMemory = await runtime.messageManager.getMemoryById(cursor);

                if (!startMemory) {
                    res.status(400).json({ error: "Memory not found" });
                    return;
                }

                pageWithNextCursor = await runtime.messageManager.getMemories({
                    roomId,
                    count: pageSize + 1,
                    unique: false,
                    end: startMemory.createdAt,
                });

                if (pageWithNextCursor.length > 0) {
                    nextCursor = pageWithNextCursor[pageWithNextCursor.length - 1].id;
                }

                page = pageWithNextCursor.slice(1, pageSize + 1);

            } else {
                page = await runtime.messageManager.getMemories({
                    roomId,
                    count: pageSize,
                    unique: false,
                });
                if (page.length > 0) {
                    nextCursor = page[page.length - 1].id;
                }
            }

            const response = {
                agentId,
                roomId,
                pageSize,
                totalCount,
                nextCursor,
                messages: page.map((memory) => ({
                    id: memory.id,
                    userId: memory.userId,
                    createdAt: memory.createdAt,
                    text: memory.content.text,
                })),
            };

            res.json(response);
        } catch (error) {
            console.error("Error fetching chat history:", error);
            res.status(500).json({ error: "Failed to fetch chat history" });
        }
    });


    router.get("/tee/agents", async (req, res) => {
        try {
            const allAgents = [];

            for (const agentRuntime of agents.values()) {
                const teeLogService = agentRuntime
                    .getService<TeeLogService>(
                    ServiceType.TEE_LOG
                )
                .getInstance();

                const agents = await teeLogService.getAllAgents();
                allAgents.push(...agents)
            }

            const runtime: AgentRuntime = agents.values().next().value;
            const teeLogService = runtime.getService<TeeLogService>(ServiceType.TEE_LOG).getInstance();
            const attestation = await teeLogService.generateAttestation(JSON.stringify(allAgents));
            res.json({ agents: allAgents, attestation: attestation });
        } catch (error) {
            elizaLogger.error("Failed to get TEE agents:", error);
            res.status(500).json({
                error: "Failed to get TEE agents",
            });
        }
    });

    router.get("/tee/agents/:agentId", async (req, res) => {
        try {
            const agentId = req.params.agentId;
            const agentRuntime = agents.get(agentId);
            if (!agentRuntime) {
                res.status(404).json({ error: "Agent not found" });
                return;
            }

            const teeLogService = agentRuntime
                .getService<TeeLogService>(
                ServiceType.TEE_LOG
            )
            .getInstance();

            const teeAgent = await teeLogService.getAgent(agentId);
            const attestation = await teeLogService.generateAttestation(JSON.stringify(teeAgent));
            res.json({ agent: teeAgent, attestation: attestation });
        } catch (error) {
            elizaLogger.error("Failed to get TEE agent:", error);
            res.status(500).json({
                error: "Failed to get TEE agent",
            });
        }
    });

    router.post(
        "/tee/logs",
        async (req: express.Request, res: express.Response) => {
            try {
                const query = req.body.query || {};
                const page = parseInt(req.body.page) || 1;
                const pageSize = parseInt(req.body.pageSize) || 10;

                const teeLogQuery: TeeLogQuery = {
                    agentId: query.agentId || "",
                    roomId: query.roomId || "",
                    userId: query.userId || "",
                    type: query.type || "",
                    containsContent: query.containsContent || "",
                    startTimestamp: query.startTimestamp || undefined,
                    endTimestamp: query.endTimestamp || undefined,
                };
                const agentRuntime: AgentRuntime = agents.values().next().value;
                const teeLogService = agentRuntime
                    .getService<TeeLogService>(
                        ServiceType.TEE_LOG
                    )
                    .getInstance();
                const pageQuery = await teeLogService.getLogs(teeLogQuery, page, pageSize);
                const attestation = await teeLogService.generateAttestation(JSON.stringify(pageQuery));
                res.json({
                    logs: pageQuery,
                    attestation: attestation,
                });
            } catch (error) {
                elizaLogger.error("Failed to get TEE logs:", error);
                res.status(500).json({
                    error: "Failed to get TEE logs",
                });
            }
        }
    );

    return router;
}
