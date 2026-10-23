# Blockers and open questions

| # | Opened (PT) | Blocker | Owner action | Status |
| --- | --- | --- | --- | --- |
| B-01 | Oct 22 21:20 | Fire TV model / OS unknown. Vega OS can't install the APK | — | **Resolved 21:40**: Fire OS 6.7.1.1 (AFTMM); ADB connected; Gate 0 PASS |
| B-02 | Oct 22 21:20 | AWS CLI not installed, no credentials on this machine | Install the AWS CLI, configure profile `firefit`, confirm the region and spending cap | Open |
| B-03 | Oct 22 21:20 | Bedrock access to Amazon Nova 2 Lite in the target region unverified | Can be checked once B-02 is resolved (`aws bedrock list-inference-profiles`) | Open |
| B-04 | Oct 22 21:20 | Devpost draft not confirmed | Create or save the draft: name, tagline, Fire TV track + AWS Builder | Open |
