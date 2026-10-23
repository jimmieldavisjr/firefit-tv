# Blockers and open questions

| # | Opened (PT) | Blocker | Owner action | Status |
| --- | --- | --- | --- | --- |
| B-01 | Oct 22 21:20 | Fire TV model / OS unknown. Vega OS can't install the APK | — | **Resolved 21:40**: Fire OS 6.7.1.1 (AFTMM); ADB connected; Gate 0 PASS |
| B-02 | Oct 22 21:20 | ~~No AWS CLI / credentials~~ → **an SCP blocks deploys.** Profile `firefit` (us-east-1, account 720022410355, AccountFullAccessRole) works, but SCP `p-39p6wt1g` from org `o-zc9swz28ds` explicitly denies CloudFormation, Lambda, DynamoDB, API Gateway v2 and SSM (verified 21:50: all `explicit deny`; S3 OK). `cdk bootstrap/deploy` cannot run | In management account 287238357997: Organizations › Policies › SCPs › `p-39p6wt1g`: detach it from 720022410355, or allow those services. Or deploy from another account. Done when `aws lambda list-functions --profile firefit` succeeds | **Open (critical path for Gates 2 and 4)** |
| B-03 | Oct 22 21:20 | Bedrock Converse on `us.amazon.nova-2-lite-v1:0` returns AccessDeniedException "Your account is currently being verified… normally less than 2 hours". Nova 2 Lite model access shows AUTHORIZED; the Nova 2 Lite and Claude Haiku 4.5 inference profiles are ACTIVE | Wait for AWS account verification (no action unless it exceeds ~2 h) | Open (waiting on AWS) |
| B-04 | Oct 22 21:20 | Devpost draft not saved yet | Owner is working on it | Open (not urgent) |
| B-05 | Oct 22 21:50 | AWS spending cap not stated | Confirm a cap (estimate: well under $5 through Nov 20 at demo volume) | Open |
