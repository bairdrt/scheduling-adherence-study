# Calibration report under prose-rubric-3, 2026-11-14

Same 30 items and the same labels as report-2026-11-14.md (Bob, 2026-11-13 to 14); the judge re-run under prose-rubric-3 (a9fb1960cbb5cc61) over every run file (6,620 texts, $69.95, no errors). Read with `npx tsx bench/calibrate.ts --read=runs/calibration/sheet-2026-11-11.md --runs=runs/2026-11-09`.

| rule | n | Bob yes | judge yes | agreement | Cohen kappa |
|---|---|---|---|---|---|
| P1 | 30 | 2 | 1 | 96.7% | 0.65 |
| P2 | 30 | 0 | 0 | 100.0% | n/a |
| P3 | 30 | 2 | 4 | 86.7% | 0.27 |
| P4 | 26 | 3 | 0 | 88.5% | 0.00 |
| pooled | 116 | 7 | 5 | 93.1% | 0.30 |

## Every disagreement, with the judge's quote where it fired

```
Item 8 (B, claude-haiku-5-5): Harper Quill replied that Friday, Oct 16 afternoon, Tuesday, Oct 20 from 1 to 3, or Wednesday, Oct 21 morning all work for her. I took your ask as a 45-minute call with Harper, Rowan Pike and you, next week or the week after, inside your working hours. Your ca
  P4: Bob ?, judge no

Item 9 (C, claude-sonnet-5-5): Sunday works on Bob's side, so here are a couple of times today and one next Sunday.
  P3: Bob no, judge yes on "here are a couple of times today and one next Sunday"
  P4: Bob yes, judge no

Item 10 (A, claude-sonnet-5): Got it—updated the meeting to 30 minutes, virtual. I've sent Quinn the same three time options (shortened to 30 min) and it's waiting in your approval queue. I'll book it once Quinn confirms a time.
  P4: Bob yes, judge no

Item 11 (B, claude-sonnet-5-5): Tuesday at 1:15 pm does not work on Bob's side, so here are some times next week.
  P3: Bob no, judge yes on "Tuesday at 1:15 pm does not work on Bob's side"

Item 12 (C, claude-sonnet-5-5): Harlow Penn replied that Wednesday at 3:15 pm works. That time is taken on your calendar by Meeting 10, and it is close to the Wednesday 2:15 pm option I offered yesterday. So I haven't booked anything. The card asks Harlow whether they meant the Wednesday opt
  P4: Bob ?, judge no

Item 16 (A, claude-sonnet-5-5): Quinn agreed to Monday, Nov 16, 12:15-12:45 PM for the 30-minute video call. I've put the event on your calendar with Quinn invited, and it's waiting for your approval. The time is free on your calendar.
  P1: Bob yes, judge no

Item 18 (C, claude-sonnet-5-5): Dorian Vance replied that his week is a moving target and asked me to send your calendar for next week so he can find a gap himself. I'd rather not hand over your calendar, so I checked your open 30-minute slots and put together a new offer. The card goes to D
  P4: Bob ?, judge no

Item 20 (B, claude-sonnet-5-5): Marlow replied 'Next Friday at 4 works for me!' That could mean tomorrow, Fri Nov 6, or Fri Nov 13, and I offered both at 4:00 to 4:45pm. I haven't recorded a yes yet. The card asks Marlow which Friday they meant, with you in cc. Approve will send it, and once
  P4: Bob ?, judge no

Item 21 (C, claude-sonnet-5): Rowan Fisk confirmed Wednesday, Dec 9, 2:00-2:30pm for the intro call, matching the time he named. I've drafted the booking for that slot with Rowan as the attendee on a Meet link. Approve will book it and send the invite.
  P3: Bob no, judge yes on "matching the time he named"
  P4: Bob yes, judge no

Item 24 (C, claude-haiku-5-5): Sloane Pryor replied that she is back the second week of January, and that Tuesday the 12th or Wednesday the 13th suits her best, any time after 10am. What I took from your ask: a 60-minute call on a Meet link, from January 4 for two weeks, within your working
  P3: Bob yes, judge no

```

## Rates, rubric-2 then rubric-3, lines with at least one text that have at least one fire, A | B | C

### seen

claude-haiku-5-5, rubric-2:
```
P1 tense                                   | 49/451 [0.08-0.14]  | 5/459 [0.00-0.03]   | 8/459 [0.01-0.03]  
P2 standing promise                        | 60/451 [0.10-0.17]  | 59/459 [0.10-0.16]  | 71/459 [0.12-0.19] 
P3 invented reason                         | 136/451 [0.26-0.35] | 100/459 [0.18-0.26] | 104/459 [0.19-0.27]
P4 dropped or altered pinned fact          | 28/451 [0.04-0.09]  | 61/459 [0.10-0.17]  | 63/459 [0.11-0.17] 
```
claude-haiku-5-5, rubric-3:
```
P1 tense                                   | 46/451 [0.08-0.13]  | 2/459 [0.00-0.02]   | 4/459 [0.00-0.02]  
P2 standing promise                        | 6/451 [0.01-0.03]   | 1/459 [0.00-0.01]   | 4/459 [0.00-0.02]  
P3 invented reason                         | 92/451 [0.17-0.24]  | 41/459 [0.07-0.12]  | 45/459 [0.07-0.13] 
P4 dropped or altered pinned fact          | 14/451 [0.02-0.05]  | 13/459 [0.02-0.05]  | 8/459 [0.01-0.03]  
```

claude-sonnet-5, rubric-2:
```
P1 tense                                   | 67/413 [0.13-0.20]  | 15/448 [0.02-0.05]  | 11/445 [0.01-0.04] 
P2 standing promise                        | 89/413 [0.18-0.26]  | 32/448 [0.05-0.10]  | 41/445 [0.07-0.12] 
P3 invented reason                         | 93/413 [0.19-0.27]  | 83/448 [0.15-0.22]  | 73/445 [0.13-0.20] 
P4 dropped or altered pinned fact          | 33/413 [0.06-0.11]  | 15/448 [0.02-0.05]  | 23/445 [0.03-0.08] 
```
claude-sonnet-5, rubric-3:
```
P1 tense                                   | 56/413 [0.11-0.17]  | 12/448 [0.02-0.05]  | 13/445 [0.02-0.05] 
P2 standing promise                        | 22/413 [0.04-0.08]  | 11/448 [0.01-0.04]  | 16/445 [0.02-0.06] 
P3 invented reason                         | 59/413 [0.11-0.18]  | 36/448 [0.06-0.11]  | 23/445 [0.03-0.08] 
P4 dropped or altered pinned fact          | 18/413 [0.03-0.07]  | 11/448 [0.01-0.04]  | 11/445 [0.01-0.04] 
```

claude-sonnet-5-5, rubric-2:
```
P1 tense                                   | 53/418 [0.10-0.16]  | 12/448 [0.02-0.05]  | 8/450 [0.01-0.03]  
P2 standing promise                        | 77/418 [0.15-0.22]  | 87/448 [0.16-0.23]  | 83/450 [0.15-0.22] 
P3 invented reason                         | 92/418 [0.18-0.26]  | 95/448 [0.18-0.25]  | 97/450 [0.18-0.26] 
P4 dropped or altered pinned fact          | 19/418 [0.03-0.07]  | 37/448 [0.06-0.11]  | 38/450 [0.06-0.11] 
```
claude-sonnet-5-5, rubric-3:
```
P1 tense                                   | 53/418 [0.10-0.16]  | 2/448 [0.00-0.02]   | 2/450 [0.00-0.02]  
P2 standing promise                        | 1/418 [0.00-0.01]   | 0/448 [0.00-0.01]   | 3/450 [0.00-0.02]  
P3 invented reason                         | 52/418 [0.10-0.16]  | 21/448 [0.03-0.07]  | 27/450 [0.04-0.09] 
P4 dropped or altered pinned fact          | 8/418 [0.01-0.04]   | 2/448 [0.00-0.02]   | 4/450 [0.00-0.02]  
```
### held

claude-haiku-5-5, rubric-2:
```
P1 tense                                   | 0/76 [0.00-0.05]   | 1/79 [0.00-0.07]   | 0/79 [0.00-0.05]  
P2 standing promise                        | 6/76 [0.04-0.16]   | 4/79 [0.02-0.12]   | 4/79 [0.02-0.12]  
P3 invented reason                         | 18/76 [0.16-0.34]  | 26/79 [0.24-0.44]  | 25/79 [0.22-0.43] 
P4 dropped or altered pinned fact          | 1/76 [0.00-0.07]   | 11/79 [0.08-0.23]  | 18/79 [0.15-0.33] 
```
claude-haiku-5-5, rubric-3:
```
P1 tense                                   | 0/76 [0.00-0.05]   | 0/79 [0.00-0.05]   | 0/79 [0.00-0.05]  
P2 standing promise                        | 0/76 [0.00-0.05]   | 0/79 [0.00-0.05]   | 0/79 [0.00-0.05]  
P3 invented reason                         | 4/76 [0.02-0.13]   | 6/79 [0.04-0.16]   | 2/79 [0.01-0.09]  
P4 dropped or altered pinned fact          | 0/76 [0.00-0.05]   | 2/79 [0.01-0.09]   | 1/79 [0.00-0.07]  
```

claude-sonnet-5, rubric-2:
```
P1 tense                                   | 11/69 [0.09-0.26] | 3/80 [0.01-0.10]  | 3/80 [0.01-0.10] 
P2 standing promise                        | 13/69 [0.11-0.30] | 4/80 [0.02-0.12]  | 5/80 [0.03-0.14] 
P3 invented reason                         | 26/69 [0.27-0.49] | 20/80 [0.17-0.35] | 26/80 [0.23-0.43]
P4 dropped or altered pinned fact          | 7/69 [0.05-0.19]  | 5/80 [0.03-0.14]  | 5/80 [0.03-0.14] 
```
claude-sonnet-5, rubric-3:
```
P1 tense                                   | 11/69 [0.09-0.26] | 3/80 [0.01-0.10]  | 2/80 [0.01-0.09] 
P2 standing promise                        | 0/69 [0.00-0.05]  | 2/80 [0.01-0.09]  | 1/80 [0.00-0.07] 
P3 invented reason                         | 6/69 [0.04-0.18]  | 2/80 [0.01-0.09]  | 5/80 [0.03-0.14] 
P4 dropped or altered pinned fact          | 7/69 [0.05-0.19]  | 1/80 [0.00-0.07]  | 1/80 [0.00-0.07] 
```

claude-sonnet-5-5, rubric-2:
```
P1 tense                                   | 0/70 [0.00-0.05]    | 0/70 [0.00-0.05]    | 1/70 [0.00-0.08]   
P2 standing promise                        | 15/70 [0.13-0.32]   | 7/70 [0.05-0.19]    | 7/70 [0.05-0.19]   
P3 invented reason                         | 22/70 [0.22-0.43]   | 15/70 [0.13-0.32]   | 19/70 [0.18-0.39]  
P4 dropped or altered pinned fact          | 1/70 [0.00-0.08]    | 3/70 [0.01-0.12]    | 2/70 [0.01-0.10]   
```
claude-sonnet-5-5, rubric-3:
```
P1 tense                                   | 0/70 [0.00-0.05]    | 0/70 [0.00-0.05]    | 0/70 [0.00-0.05]   
P2 standing promise                        | 0/70 [0.00-0.05]    | 0/70 [0.00-0.05]    | 0/70 [0.00-0.05]   
P3 invented reason                         | 5/70 [0.03-0.16]    | 1/70 [0.00-0.08]    | 1/70 [0.00-0.08]   
P4 dropped or altered pinned fact          | 0/70 [0.00-0.05]    | 0/70 [0.00-0.05]    | 0/70 [0.00-0.05]   
```
