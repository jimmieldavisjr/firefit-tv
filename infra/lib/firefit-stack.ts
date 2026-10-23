// One stack: DynamoDB table, ApiFn + CoachFn, HTTP API, S3 + CloudFront for the web apps.
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.join(here, "../../apps/api/src");

export interface FireFitStackProps extends StackProps {
  /** Extra CORS origins for the Vite dev server, e.g. https://192.168.1.20:5173. Empty for production. */
  devOrigins: string[];
  /** Bedrock model or inference profile id the coach agent reasons with. */
  modelId: string;
  /** Display name and body weight (for the labeled calorie estimate) of the single demo profile. */
  profileName?: string;
  profileWeightKg?: number;
}

export class FireFitStack extends Stack {
  constructor(scope: Construct, id: string, props: FireFitStackProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, "Table", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Strands is ESM-only: bundle as ESM and shim require for AWS SDK internals
    const bundling = {
      format: OutputFormat.ESM,
      target: "node22",
      mainFields: ["module", "main"],
      banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      externalModules: [], // bundle the AWS SDK too: production runs exactly the versions we test
    };
    const base = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      bundling,
      depsLockFilePath: path.join(here, "../../pnpm-lock.yaml"),
      projectRoot: path.join(here, "../.."),
    };

    const coachFn = new NodejsFunction(this, "CoachFn", {
      ...base,
      entry: path.join(apiSrc, "coach.ts"),
      memorySize: 1024,
      timeout: Duration.seconds(90), // two model calls: streamed analysis, then the structured plan
      retryAttempts: 0, // no duplicate plans
      environment: { TABLE: table.tableName, MODEL_ID: props.modelId },
      logGroup: new logs.LogGroup(this, "CoachLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });
    const apiFn = new NodejsFunction(this, "ApiFn", {
      ...base,
      entry: path.join(apiSrc, "api.ts"),
      memorySize: 512,
      timeout: Duration.seconds(10),
      environment: {
        TABLE: table.tableName,
        COACH_FN: coachFn.functionName,
        PROFILE_NAME: props.profileName ?? "Guest",
        PROFILE_WEIGHT_KG: String(props.profileWeightKg ?? 80),
      },
      logGroup: new logs.LogGroup(this, "ApiLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });
    table.grantReadWriteData(apiFn);
    table.grantReadWriteData(coachFn);
    coachFn.grantInvoke(apiFn);
    coachFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], // Converse + ConverseStream
        resources: [
          "arn:aws:bedrock:*::foundation-model/*",
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        ],
      }),
    );

    const site = new s3.Bucket(this, "Site", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
    const cdn = new cloudfront.Distribution(this, "Cdn", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "tv.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    const http = new apigwv2.HttpApi(this, "Http", {
      corsPreflight: {
        allowOrigins: [`https://${cdn.distributionDomainName}`, ...props.devOrigins],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PUT],
        allowHeaders: ["content-type", "x-room-token", "x-profile-id"],
        maxAge: Duration.hours(1),
      },
    });
    const integration = new HttpLambdaIntegration("ApiInt", apiFn);
    const routes = [
      ["POST", "/rooms"],
      ["GET", "/rooms/{code}/{kind}"],
      ["PUT", "/rooms/{code}/{kind}"],
      ["POST", "/workouts"],
      ["GET", "/workouts/{id}/coach"],
      ["GET", "/profile"],
      ["GET", "/profiles"],
      ["POST", "/profiles"],
      ["GET", "/workouts/{id}"],
    ] as const;
    for (const [m, p] of routes) http.addRoutes({ path: p, methods: [apigwv2.HttpMethod[m]], integration });
    (http.defaultStage!.node.defaultChild as apigwv2.CfnStage).defaultRouteSettings = {
      throttlingRateLimit: 20, // per-stage abuse ceiling
      throttlingBurstLimit: 40,
    };

    new CfnOutput(this, "ApiUrl", { value: http.apiEndpoint });
    new CfnOutput(this, "SiteUrl", { value: `https://${cdn.distributionDomainName}` });
    new CfnOutput(this, "Bucket", { value: site.bucketName });
    new CfnOutput(this, "DistributionId", { value: cdn.distributionId });
    new CfnOutput(this, "CoachFnName", { value: coachFn.functionName });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}
