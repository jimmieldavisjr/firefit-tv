# Release and submission checklist

Tick only with evidence. Deadline: **Fri Oct 23, 2026, 12:00 PM PT** (submissions lock).

## Repository
- [ ] Public GitHub repo with MIT `LICENSE`; license shows in the About section
- [ ] README: what it is, architecture, setup someone else can follow, security limits, known limitations, credits
- [ ] Demo video link added to the README
- [ ] Release `v1.0.0` with `firefit.apk` attached (set repo variable `FIREFIT_URL`, then push the tag)
- [ ] No secrets in history (`git log -p | grep -iE "aws_secret|AKIA"` is empty)

## Product (each verified on the real device)
- [ ] Shell launches from the Fire TV home row
- [ ] Library → Squat Fundamentals with the remote only
- [ ] QR pairing → live phone video with skeleton on the TV
- [ ] Real squats increment the TV counter; half squats don't
- [ ] 2 sets with rest, driven by the remote, reach COMPLETE
- [ ] Workout saved to DynamoDB; summary shows stats
- [ ] Coach plan shows `source: "agent"`; CloudWatch line lists all 3 tool calls
- [ ] After a relaunch, the library "Recommended next" card shows the agent's plan
- [ ] 3 cold-start runs from CloudFront in a row

## Demo video
- [ ] Under 3:00, English, captions, no copyrighted music, no third-party trademarks
- [ ] Shows the real Fire TV (wide shot), the QR scan, live reps, the coach plan, the CloudWatch trace
- [ ] Uploaded to YouTube as **Public**; plays in a logged-out window

## Devpost
- [ ] Draft saved early: name, tagline, Fire TV track + AWS Builder
- [ ] Description written only from verified functionality ([devpost-submission.md](devpost-submission.md))
- [ ] Built-with tags, repo URL, video URL, 3 screenshots
- [ ] AWS Builder services text
- [ ] Product feedback for every tool ([feedback.md](feedback.md))
- [ ] Friction log entries ([friction-log.md](friction-log.md))
- [ ] "New project built during the submission window" statement
- [ ] **Submitted**, confirmation verified (owner action)

## After submission
- [ ] Keep the AWS stack and CloudFront live until **Nov 20, 2026, 12:00 PM PT** (end of judging)
- [ ] No changes to the submitted materials after the deadline
