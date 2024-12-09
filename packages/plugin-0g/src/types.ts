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
    name: z.string(),
    serviceType: z.string(),
    inputPrice: z.string(),
    outputPrice: z.string(),
    updatedAt: z.string(),
    model: z.string(),
    url: z.string(),
});

export const ServiceListSchema = z.object({
    services: z.array(ServiceSchema),
});

export interface ServiceContent {
    provider: string;
    name: string;
    serviceType: string;
    inputPrice: string;
    outputPrice: string;
    updatedAt: string;
    model: string;
    url: string;
}

export const isServiceContent = (object: any): object is ServiceContent => {
    if (ServiceSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};

export interface ServiceListContent {
    services: ServiceContent[];
}

export const isServiceListContent = (object: any): object is ServiceListContent => {
    if (ServiceListSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};

export const ServiceDepositSchema = z.object({
    service: ServiceSchema,
    deposit: z.string(),
});

export interface ServiceDepositContent {
    service: ServiceContent;
    deposit: string;
}

export const isServiceDepositContent = (object: any): object is ServiceDepositContent => {
    if (ServiceDepositSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};

export const ServiceCallInputsSchema = z.object({
    service: ServiceSchema,
    input: z.string(),
});

export interface ServiceCallInputsContent {
    service: ServiceContent;
    input: string;
}

export const isServiceCallInputsContent = (object: any): object is ServiceCallInputsContent => {
    if (ServiceCallInputsSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};
