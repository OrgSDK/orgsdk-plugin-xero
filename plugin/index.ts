import type { PluginContext, PluginFactory } from "@orgsdk/plugins";
import { configSchema } from "./config";
import { createFunctions } from "./functions";

const createPlugin: PluginFactory = (context: PluginContext) => ({
	safeFunctions: createFunctions(context.stores.config),
	config: {
		title: "Xero read-only connection",
		description:
			"Choose one account. Secrets belong in the attached credential.",
		schema: configSchema,
	},
});
export default createPlugin;
