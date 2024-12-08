import { Plugin } from "@ai16z/eliza";
import { zgUpload } from "./actions/upload";
import { zgcListServices } from "./actions/compute_network/list_service";
import { zgcCreateAccount } from "./actions/compute_network/create_account";
import { zgcDeposit } from "./actions/compute_network/deposit";
export const zgPlugin: Plugin = {
    description: "ZeroG Plugin for Eliza",
    name: "ZeroG",
    actions: [zgUpload, zgcListServices, zgcCreateAccount, zgcDeposit],
    evaluators: [],
    providers: [],
};

export default zgPlugin;