import { App } from "aws-cdk-lib";
import { FireFitStack } from "../lib/firefit-stack";

const app = new App();
new FireFitStack(app, "FireFit", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "us-east-1" },
  devOrigins: process.env.DEV_ORIGINS?.split(",").filter(Boolean) ?? [],
  modelId: process.env.MODEL_ID ?? "us.amazon.nova-2-lite-v1:0",
  description: "FireFIT: pairing, workouts and the Strands coach agent (Fire TV hackathon)",
});
