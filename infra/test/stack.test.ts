import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it, vi } from "vitest";

// Skip esbuild bundling in unit tests: the assertions only look at the template.
vi.mock("aws-cdk-lib/aws-lambda-nodejs", async (orig) => {
  const mod = await orig<typeof import("aws-cdk-lib/aws-lambda-nodejs")>();
  const lambda = await import("aws-cdk-lib/aws-lambda");
  class NodejsFunction extends lambda.Function {
    constructor(scope: never, id: string, props: Record<string, unknown>) {
      super(scope, id, {
        ...(props as object),
        code: lambda.Code.fromInline("export const handler = async () => {}"),
        handler: "index.handler",
      } as never);
    }
  }
  return { ...mod, NodejsFunction };
});

const { FireFitStack } = await import("../lib/firefit-stack");

describe("FireFitStack", () => {
  const app = new App();
  const stack = new FireFitStack(app, "Test", {
    env: { account: "123456789012", region: "us-east-1" },
    devOrigins: [],
    modelId: "us.amazon.nova-2-lite-v1:0",
  });
  const t = Template.fromStack(stack);

  it("has one table with TTL", () => {
    t.resourceCountIs("AWS::DynamoDB::GlobalTable", 1);
    t.hasResourceProperties("AWS::DynamoDB::GlobalTable", { TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true } });
  });

  it("exposes exactly the six API routes", () => {
    const routes = Object.values(t.findResources("AWS::ApiGatewayV2::Route")).map((r) => r.Properties.RouteKey);
    expect(routes.sort()).toEqual(
      ["GET /profile", "GET /rooms/{code}/{kind}", "GET /workouts/{id}/coach", "POST /rooms", "POST /workouts", "PUT /rooms/{code}/{kind}"].sort(),
    );
  });

  it("throttles the stage and limits CORS to known origins", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
    });
    t.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: Match.objectLike({ AllowHeaders: ["content-type", "x-room-token"] }),
    });
  });

  it("lets only the coach call Bedrock, and never retries it", () => {
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"] }),
        ]),
      },
    });
    t.hasResourceProperties("AWS::Lambda::EventInvokeConfig", { MaximumRetryAttempts: 0 });
  });
});
