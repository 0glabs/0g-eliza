import { Service } from "@ai16z/eliza";
import { z } from "zod";

export const UploadSchema = z.object({
    filePath: z.string()
});

export interface UploadContent {
    filePath: string;
}

export const isUploadContent = (object: any): object is UploadContent => {
    if (UploadSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};

export const ServiceSchema = z.object({
    provider: z.string(),
    serviceType: z.string(),
    inputPrice: z.bigint(),
    outputPrice: z.bigint(),
    updatedAt: z.bigint(),
    model: z.string(),
});

export const ServiceListSchema = z.object({
    services: z.array(ServiceSchema),
});

export interface ServiceContent {
    provider: string;
    serviceType: string;
    inputPrice: bigint;
    outputPrice: bigint;
    updatedAt: bigint;
    model: string;
}

export interface ServiceListContent {
    services: ServiceContent[];
}
