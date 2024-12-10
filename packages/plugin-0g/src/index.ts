import { Plugin } from "@ai16z/eliza";
import { zgsUpload } from "./actions/storage/upload";
import { zgcListServices } from "./actions/compute_network/list_service";
import { zgcCreateAccount } from "./actions/compute_network/create_account";
import { zgcDepositFund } from "./actions/compute_network/deposit_fund";
import { zgcCallService } from "./actions/compute_network/call_service";
import { zgcSettleFee } from "./actions/compute_network/settle_fee";

export const zgPlugin: Plugin = {
    description: "ZeroG Plugin for Eliza",
    name: "ZeroG",
    actions: [zgsUpload, zgcListServices, zgcCreateAccount, zgcDepositFund, zgcCallService, zgcSettleFee],
    evaluators: [],
    providers: [],
};

export default zgPlugin;