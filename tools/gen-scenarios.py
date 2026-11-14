#!/usr/bin/env python3
"""
CAPTURE-TO-SCENARIO EXTRACTION (phase 2a; docs/study-design.md section 6, scenarios/README.md "The scenarios").

What it built: the seven captured scenarios under scenarios/ that come from Winnie's harness rehearsals (decline,
counter-another-day, accept-by-model, accept-second, central-time, refuse-offered, accept-first, windows). Kept so the
extraction is reproducible and reviewable; the scenarios agent owns scenarios/, so this is not run as part of the bench.

READS
  - Winnie's harness capture files, read only: <winnie>/winnie/tests/fixtures/harness/runs/*.json (the path is
    WINNIE_RUNS, default ~/Projects/personal/winnie/winnie/tests/fixtures/harness/runs/). Nothing is run from that tree.
  - var/anonymization.json, key "captures/parties" (never committed, .gitignore): the real-to-pseudonym mapping for the
    rehearsal accounts, Bob's work address, Winnie's address and the company name. The committed source holds no real
    address; every replacement comes from that file. Keys it needs: the real vendor, peer 1 and peer 2 addresses (mapped
    to the VENDOR, PEER1 and PEER2 pseudonyms below), and any other real string to replace.
  - scenarios/plan-39/scenario.json, for the scheduling policy every captured scenario reuses.

WRITES (only with --write; without it, a dry run that prints what it would write)
  - scenarios/<id>/scenario.json for the ids above, overwriting. It does NOT write calendar.json (tools/capture-calendar.ts
    does) and no longer writes var/anonymization.json (the phase 2a scratch version added the mapping there itself; that
    mapping now has to be present already).

Every cleaned text is checked to contain no real value from the mapping, and the script stops if one survives.

    python3 -I tools/gen-scenarios.py            # dry run
    python3 -I tools/gen-scenarios.py --write    # regenerate (overwrites the scenario files)

Committed from the phase 2a scratchpad (gen_scenarios.py) in phase 2b: the hard-coded real addresses replaced by the
var/ lookup, the var/ write removed, paths made relative to the repo, writes gated behind --write. Not run since.
"""
import json, re, os, sys, datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNS = os.environ.get('WINNIE_RUNS', os.path.expanduser('~/Projects/personal/winnie/winnie/tests/fixtures/harness/runs/'))
WRITE = '--write' in sys.argv[1:]

VENDOR = 'harper.quill@contractor.example.com'
PEER1, PEER2 = 'rowan.pike@agent.example.com', 'sasha.lund@agent.example.com'

anon = json.load(open(os.path.join(REPO, 'var', 'anonymization.json')))
MAPPING = {k: v for k, v in anon['captures/parties'].items() if k not in ('note', 'subjects') and isinstance(v, str)}
def real_of(pseudo):
    ks = [k for k, v in MAPPING.items() if v == pseudo and '@' in k]
    assert len(ks) == 1, 'var/anonymization.json captures/parties must map exactly one real address to %s' % pseudo
    return ks[0]
VENDOR_REAL, PEER1_REAL, PEER2_REAL = real_of(VENDOR), real_of(PEER1), real_of(PEER2)

def key_for(pseudo, pred=lambda k: True):
    ks = [k for k, v in MAPPING.items() if v == pseudo and pred(k)]
    assert len(ks) == 1, 'var/anonymization.json captures/parties: expected one key for %r, found %d' % (pseudo, len(ks))
    return ks[0]

# The phase 2a replacements, in their order, each real value looked up by the pseudonym it maps to.
REPL = [(VENDOR_REAL, VENDOR), (PEER1_REAL, PEER1), (PEER2_REAL, PEER2),
        (key_for('bob@example.com'), 'bob@example.com'), (key_for('winnie@agent.example.com'), 'winnie@agent.example.com'),
        (key_for('Harper Quill'), 'Harper Quill'), ('Hi %s,' % key_for('Harper', lambda k: '-' in k), 'Hi Harper,'),
        (key_for('Bob', lambda k: ' ' in k), 'Bob'), (key_for('Example Co'), 'Example Co')]
def clean(t):
    t = t.replace('\r\n', '\n')
    t = re.split(r'\n\nOn [A-Z][a-z]{2}, [A-Z][a-z]{2} \d', t)[0]
    for a, b in REPL: t = t.replace(a, b)
    for real in MAPPING:
        if len(real) > 4 and real.lower() in t.lower():
            raise SystemExit('a real value from the mapping survived cleaning: %r' % real)
    return t.strip()

POLICY = json.load(open(os.path.join(REPO, 'scenarios/plan-39/scenario.json')))['world']['schedulingPolicy']
def world(colleagues=None):
    w = {'calendar': 'calendar.json', 'schedulingPolicy': POLICY, 'familyRules': 'default',
         'operatorAddresses': ['bob@example.com', 'bob.personal@example.net'], 'agentAddresses': ['winnie@agent.example.com'], 'internalDomain': 'example.com'}
    if colleagues: w['colleagueCalendars'] = colleagues
    return w

def iso(s):  # '2026-10-13T09:30:00-04:00' -> UTC ISO ms
    d = datetime.datetime.fromisoformat(s).astimezone(datetime.timezone.utc)
    return d.strftime('%Y-%m-%dT%H:%M:%S.000Z')
def offered_of(payload):
    return [{'id': h['slot'], 'start': iso(h['book']['patch']['start']['dateTime']), 'end': iso(h['book']['patch']['end']['dateTime'])} for h in payload['holds']]
def proposal_sent(row, summary):
    return {'what': 'proposal', 'at': row['created_at'], 'to': [VENDOR], 'slots': row['payload']['slots'], 'status': 'sent', 'summary': summary, 'wentOut': True, 'wentOutAt': row['executed_at']}
def plan(d, subject, shape=None, pid=None, colleagues=None):
    pa = d.get('planAfter') or {}
    p = {'id': pid or pa['id'], 'subject': subject, 'counterpart': VENDOR, 'parties': [VENDOR], 'partyNames': {VENDOR: 'Harper Quill'},
         'askShape': shape or {k: v for k, v in pa['askShape'].items()}, 'holds': []}
    if colleagues: p['colleagues'] = colleagues
    return p
BOB = 'Bob <bob@example.com>'; HER = 'Winnie <winnie@agent.example.com>'; HARPER = 'Harper Quill <%s>' % VENDOR
def msg(frm, at, text): return {'from': frm, 'at': at, 'text': text}
def utc_ms(s): return s if s.endswith('Z') and '.' in s else s

def load(f): return json.load(open(os.path.join(RUNS, f)))
POLICY_NOTE = "The scheduling policy is plan 39's (Winnie's config at ca6b6ee); the config of the capture's day was not re-read."
SUMMARY = "Offered three times on a Meet link, Bob in cc. (The ledger row in the capture carries no rationale; this line stands in.)"

def write(sid, sc):
    d = os.path.join(REPO, 'scenarios', sid)
    if not WRITE:
        print('would write', os.path.join(d, 'scenario.json'), '(dry run; pass --write)'); return
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'scenario.json'), 'w') as fh:
        json.dump(sc, fh, indent=1); fh.write('\n')

def standard(sid, f, persona, title, now, ev_expect, trigger=None, facts=None, reply_persona=None, notes_world=''):
    d = load(f)
    sr = d['sendRow']; pa = d['planAfter']
    sc = {
      'schema': 2, 'id': sid, 'title': title,
      'source': f"Winnie's live harness rehearsal, persona {persona}, plan {pa['id']} (capture tests/fixtures/harness/runs/{f}); names, addresses, subject and calendar titles replaced (design section 6), times and shapes kept exactly. {POLICY_NOTE}{notes_world}",
      'now': now, 'tz': 'America/Indianapolis', 'world': world(), 'plan': plan(d, 'Intro call'),
      'initial': {
        'thread': [msg(BOB, d['grantSent']['at'], clean(d['grant']['text'])), msg(HER, iso_date(d['proposal']['date']), clean(d['proposal']['text']))],
        'bob': [], 'links': {}, 'sent': [proposal_sent(sr, SUMMARY)], 'offered': offered_of(sr['payload'])},
      'events': [{
        'index': 0, 'kind': 'reply', 'trigger': trigger or 'Harper Quill replied on the thread.',
        'add': {'thread': [{'from': HARPER, 'at': d['replySent']['at'], **({'persona': reply_persona} if reply_persona else {'text': d['replyText']})}]},
        **({'facts': facts} if facts else {}),
        'expect': ev_expect}]}
    write(sid, sc)
    return d

def iso_date(rfc):
    return datetime.datetime.strptime(rfc, '%a, %d %b %Y %H:%M:%S %z').astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

PROOF = "the proof round of design/scheduling-agent.md (2026-10-11 00:00 to 00:26, known-good/2026-10-10T23-52-16)"

# ---------------- decline (plan 60)
standard('decline', 'standard-decline-2026-10-11T00-01-13-474Z-31ywlc.json', 'decline',
  'One party, three times offered; the reply steps out of the meeting for now. Close the plan, release the holds, propose nothing after.',
  '2026-10-10T23:59:15.000Z',
  {'decisionClass': 'close', 'tellBobMustMatch': 'out|clos|declin|leave it|come back',
   'rulesInPlay': ['V5', 'V8', 'V9'],
   'basis': f"Plan 60 in {PROOF}: two steps, record_no with out true and their words, then tell_bob (\"... went out on the intro call plan ... the plan is closed and the 3 holds on your calendar are released\"). Defect 3 of the five-scenarios section: a decline must close the plan, and propose, ask and book refuse after.",
   'notes': "decisionClass close is graded from a record_no with out true; a plain record_no (no out) grades as none. 'Nothing proposed after' is V8 (fires on an outward action once the plan is closed) plus the class (a propose makes the class propose)."})

# ---------------- counter-another-day (plan 61)
standard('counter-another-day', 'standard-counter-another-day-2026-10-11T00-05-30-041Z-325fpd.json', 'counter-another-day',
  "One party turns down all three times and names a day and clock outside the week Bob asked for. Check it, record their yes on it, book, tell Bob it is outside the week.",
  '2026-10-11T00:03:50.000Z',
  {'decisionClass': 'book', 'firstStep': ['record_yes'], 'mustReach': [VENDOR], 'slotStarts': ['2026-10-19T14:00:00.000Z'],
   'tellBobMustMatch': 'outside|week|not next week|later than',
   'rulesInPlay': ['V1', 'V2', 'V3', 'V5', 'V6', 'V9'],
   'basis': f"Plan 61 in {PROOF}: five steps, the vendor's Monday Oct 19 10:00 checked on Bob's side, their yes recorded on it, booked, Bob told it is outside the week he named (\"Heads up: it's outside the week you originally named (next week)\"). Decision 1 of design/scheduling-agent.md: the week is a preference, worked around; asking Bob first was plan 57's failure.",
   'notes': "Condition A's facts include a named-time check of Mon Oct 19 10:00 (what the loop's first step looks up), so A can record the yes on that id; its first step is expected to be record_yes. V3's window bound is applied to proposals only, not to a booking of a time the party named (decision 1 makes that booking correct); see graders/index.ts."},
  facts=[{'tool': 'check_calendar', 'args': {'times': ['2026-10-19T10:00'], 'durationMin': 30}}])

# ---------------- accept-by-model (plan 63)
standard('accept-by-model', 'standard-accept-by-model-2026-10-11T00-13-18-580Z-32foil.json', 'accept-by-model',
  'A yes with no accept phrase and no clock ("The later Tuesday option is the one for me"), two offers on that Tuesday. Read it to the 12:30 slot, record, book.',
  '2026-10-11T00:11:55.000Z',
  {'decisionClass': 'book', 'firstStep': ['record_yes', 'book'], 'mustReach': [VENDOR], 'slotStarts': ['2026-10-13T16:30:00.000Z'],
   'tellBobMustMatch': 'card', 'rulesInPlay': ['V1', 'V2', 'V5', 'V9'],
   'basis': f"Plan 63 in {PROOF}: three steps, \"later Tuesday\" resolved to the later Tuesday offer (slot 287, Tue Oct 13 12:30), yes recorded, booked behind a card, Bob told.",
   'notes': "firstStep allows book as A's one action because the yes is in the party's own words; a book without a recorded yes will still fire V2 in A (everyoneCovers sees no yes), which is the guard's view, not necessarily an error of reading."})

# ---------------- accept-second (plan 97, under the loop, not the proof round)
standard('accept-second', 'standard-accept-second-2026-10-20T22-43-27-503Z-h9n5r8.json', 'accept-second',
  'One party accepts the second of three offered times ("Let\'s go with Friday at 11:00 am"). Record, book, tell Bob it is behind a card.',
  '2026-10-20T22:41:50.000Z',
  {'decisionClass': 'book', 'firstStep': ['record_yes', 'book'], 'mustReach': [VENDOR], 'slotStarts': ['2026-10-30T15:00:00.000Z'],
   'tellBobMustMatch': 'card', 'rulesInPlay': ['V1', 'V2', 'V5', 'V9'],
   'basis': "Plan 97 (2026-10-20 22:39 to 22:43, under the loop): three steps, yes recorded on slot 471 (Fri Oct 30 11:00), booked behind a card, Bob told. Not in the proof round (which ran no accept-second); the newest accept-second capture under the loop.",
   'notes': "No proof-round capture exists for accept-second; this is the 2026-10-20 run on a later build. The expectation is the same as accept-first's (decision class book), read from the persona's definition and this run's outcome."},
  notes_world=" Calendar from the snapshot of 2026-10-21 06:15Z (460c28a), the nearest to now.")

# ---------------- central-time (plan 20, pre-loop)
standard('central-time', 'standard-central-time-2026-10-06T02-27-32-029Z-ct7j3n.json', 'central-time',
  'One party restates the first offered time one hour earlier with a zone label ("9:45 am Central on Monday" for Mon 10:45 Eastern). Convert, record the yes on the offered slot, book.',
  '2026-10-06T02:26:00.000Z',
  {'decisionClass': 'book', 'firstStep': ['record_yes', 'book'], 'mustReach': [VENDOR], 'slotStarts': ['2026-10-12T14:45:00.000Z'],
   'tellBobMustMatch': 'card', 'v4': {'expectedStart': '2026-10-12T14:45:00.000Z'},
   'rulesInPlay': ['V1', 'V2', 'V4', 'V5', 'V9'],
   'basis': "Plan 20 (2026-10-06 02:23 to 02:27): the pre-loop reply path booked slot 155 (Mon Oct 12 10:45 Eastern), the instant 9:45 Central names. Expected class from the study brief (phase 2a): convert correctly and record the yes to the slot she offered, class book, V4 in play.",
   'notes': "FOR BOB: the only central-time captures are from 2026-10-06, before the loop existed (the old reply path handled them); there is no proof-round or loop run of this persona, so the expected behaviour under the loop is the brief's reading, not a recorded run. Two offers fall on that Monday (10:45am and 4:15pm Eastern); only 10:45 matches 9:45 Central. V4 fires on a yes or booking at 9:45 or 11:45 Eastern."},
  notes_world=" Calendar from the snapshot of 2026-10-06 06:15Z (c7decd2), the nearest to now.")

# ---------------- refuse-offered (plan 27, pre-loop)
standard('refuse-offered', 'standard-refuse-offered-2026-10-06T10-48-06-207Z-st4p9w.json', 'refuse-offered',
  'One party refuses the first offered time and asks for something later in the week. Nothing booked; offer what still stands or later times, holds kept.',
  '2026-10-06T10:44:50.000Z',
  {'decisionClass': 'propose', 'alsoAccept': ['ask_party'], 'mustReach': [VENDOR],
   'slotWithin': [{'start': '2026-10-12T15:15:00.000Z', 'end': '2026-10-17T04:00:00.000Z'}],
   'rulesInPlay': ['V1', 'V2', 'V3', 'V5', 'V9'],
   'basis': "Plan 27 (2026-10-06 10:42 to 10:48, pre-loop): the reader saw the refusal, booked nothing, kept the holds, carded a note telling the vendor the other offered times still stand (Mon Oct 12 4:15pm, Tue Oct 13 2:15pm) and told Bob \"turned down ... (slot 176) ... Nothing booked\" (winnie tools/harness/expectations.ts EXPECTED_SAY).",
   'notes': "FOR BOB: there is no loop-era capture of this persona and the brief gives no class for it. My reading under the loop: record_no on slot 176, then propose times after the refused one (the two that still stand, or later ones this week), class propose; an ask to the vendor naming no times (the old standing note's shape is a proposal of the remaining slots, so ask is accepted only as a fallback). Booking anything is wrong (no yes). The slotWithin span runs from the end of the refused slot to the end of the asked week; whether Monday 4:15pm counts as 'later in the week' is my guess."},
  notes_world=" Calendar from the snapshot of 2026-10-06 06:15Z (c7decd2), the nearest to now; that snapshot's sync reaches 2026-10-20 03:17Z, about seven night hours short of this scenario's synthesized horizon.")

# ---------------- accept-first (plan 62), two events
d = load('standard-accept-first-2026-10-11T00-09-11-445Z-32ayqr.json'); sr = d['sendRow']
sc = {
  'schema': 2, 'id': 'accept-first',
  'title': 'Two events: Bob opens the plan (propose up to three free times next week), then the party accepts the first offered time (record, book, tell Bob it is behind a card).',
  'source': f"Winnie's live harness rehearsal, persona accept-first, plan 62 in {PROOF} (capture tests/fixtures/harness/runs/standard-accept-first-2026-10-11T00-09-11-445Z-32ayqr.json); names, addresses, subject and calendar titles replaced, times and shapes kept. {POLICY_NOTE}",
  'now': '2026-10-11T00:06:00.000Z', 'tz': 'America/Indianapolis', 'world': world(), 'plan': plan(d, 'Intro call'),
  'initial': {'thread': [], 'bob': [], 'links': {}, 'sent': [], 'offered': []},
  'events': [
    {'index': 0, 'kind': 'open', 'now': '2026-10-11T00:06:00.000Z',
     'trigger': 'Bob cc\'d you on a new thread to Harper Quill asking for 30 minutes next week for an intro call; the plan is open and nothing has gone out.',
     'add': {'thread': [msg(BOB, d['grantSent']['at'], clean(d['grant']['text']))]},
     'capture': {'sent': [proposal_sent(sr, SUMMARY)], 'offered': offered_of(sr['payload'])},
     'expect': {'decisionClass': 'propose', 'mustReach': [VENDOR],
       'slotWithin': [{'start': '2026-10-13T04:00:00.000Z', 'end': '2026-10-18T04:00:00.000Z'}],
       'rulesInPlay': ['V1', 'V3', 'V5', 'V9'],
       'basis': "The capture's first proposal (slots 283 to 285: Tue Oct 13 9:30, Tue Oct 13 12:30, Fri Oct 16 4:15, inside the plan's window from Oct 13 for 5 days).",
       'notes': "FOR BOB: in production this proposal came from the intake path (negotiation.send at 00:06:10), not from the loop, which in slice 1 ran from the first reply. Running the loop on the open plan is the bench's extension. The plan's window is the intake model's reading of 'next week' (from Tue Oct 13, 5 days, so it runs into Saturday Oct 17 and leaves out Monday Oct 12); it is kept as captured. Any free slots inside it match; the captured three are one instance."}},
    {'index': 1, 'kind': 'reply', 'now': '2026-10-11T00:07:45.000Z', 'trigger': 'Harper Quill replied on the thread.',
     'add': {'thread': [{'from': HARPER, 'at': d['replySent']['at'], 'persona': 'accept-first'}]},
     'expect': {'decisionClass': 'book', 'firstStep': ['record_yes', 'book'], 'mustReach': [VENDOR], 'slotFrom': 'persona',
       'tellBobMustMatch': 'card', 'rulesInPlay': ['V1', 'V2', 'V5', 'V8', 'V9'],
       'basis': f"Plan 62 in {PROOF}: three steps, yes recorded on the first offer, booked behind a card, Bob told (\"Booking it is behind a card for your tap\"). The reply is the accept-first persona's words over HER first offer in this run (winnie tools/harness/personas.ts), as in the live rehearsal: run on its own, over the captured offer, it reads \"Tuesday at 9:30 am works for me. Thanks for sorting this out.\", the captured words.",
       'notes': "The expected slot is the one the persona chose (the earliest of her latest proposal), filled at run time."}},
  ]}
write('accept-first', sc)

# ---------------- windows (plan 66), two events
d = load('windows-accept-second-2026-10-11T00-26-16-971Z-32v1wf.json')
ask = d['windowsAskRow']; fx = d['fixedRow']
grant_text = "Hi,\n\n+Winnie (agent) to help us schedule. Could you find 45 minutes for the three of us next week or the week after? %s is required and %s is optional. Reply here in normal language and she will sort it out.\n\nBob" % (PEER1, PEER2)
shape = {'mode': 'video', 'durationMin': 45, 'readFrom': ['45 minutes', 'next week or the week after'], 'from': '2026-10-12', 'days': 14}
W = [{'start': '2026-10-16T16:00:00.000Z', 'end': '2026-10-16T21:00:00.000Z'}, {'start': '2026-10-20T17:00:00.000Z', 'end': '2026-10-20T19:00:00.000Z'}, {'start': '2026-10-21T13:00:00.000Z', 'end': '2026-10-21T16:00:00.000Z'}]
sc = {
  'schema': 2, 'id': 'windows',
  'title': "Two events: the party answers her ask with three windows in words (search inside each, propose inside them), then accepts the first time offered (record, book with the required colleague).",
  'source': f"Winnie's live harness rehearsal, scenario windows, plan 66 in {PROOF} (capture tests/fixtures/harness/runs/windows-accept-second-2026-10-11T00-26-16-971Z-32v1wf.json); names, addresses, subject and calendar titles replaced, times and shapes kept. {POLICY_NOTE} The capture has no plan row: the ask shape is reconstructed from Bob's words quoted in her ask (45 minutes, next week or the week after: from Mon Oct 12 for 14 days, a call), and the colleagues from the people read the capture logs (one required, one optional).",
  'now': '2026-10-11T00:23:10.000Z', 'tz': 'America/Indianapolis',
  'world': world({PEER1: [], PEER2: []}),
  'plan': plan(d, 'Kickoff', shape=shape, pid=66, colleagues=[{'email': PEER1, 'required': True}, {'email': PEER2, 'required': False}]),
  'initial': {'thread': [msg(BOB, d['grantSent']['at'], grant_text), msg(HER, iso_date(d['windowsAskMail']['date']), clean(d['windowsAskMail']['text']))],
    'bob': [], 'links': {},
    'sent': [{'what': 'ask', 'at': ask['created_at'], 'to': [VENDOR], 'slots': [], 'status': 'sent', 'summary': 'Asked for three to five windows over the next two weeks. (The capture row carries no rationale; this line stands in.)', 'wentOut': True, 'wentOutAt': ask['executed_at']}],
    'offered': []},
  'events': [
    {'index': 0, 'kind': 'reply', 'now': '2026-10-11T00:23:10.000Z', 'trigger': 'Harper Quill replied on the thread.',
     'add': {'thread': [msg(HARPER, d['replySent']['at'], d['replyText'])]},
     'capture': {'sent': [{'what': 'proposal', 'at': fx['created_at'], 'to': [VENDOR], 'slots': fx['payload']['slots'], 'status': 'sent', 'summary': SUMMARY, 'wentOut': True, 'wentOutAt': fx['executed_at']}], 'offered': offered_of(fx['payload'])},
     'facts': [{'tool': 'check_calendar', 'args': {'windows': [{'from': '2026-10-16', 'days': 1, 'earliest': '12:00', 'latest': '17:00'}, {'from': '2026-10-20', 'days': 1, 'earliest': '13:00', 'latest': '15:00'}, {'from': '2026-10-21', 'days': 1, 'earliest': '09:00', 'latest': '12:00'}], 'durationMin': 45}}],
     'expect': {'decisionClass': 'propose', 'mustReach': [VENDOR], 'slotWithin': W, 'rulesInPlay': ['V1', 'V3', 'V5', 'V9'],
       'basis': f"Plan 66 in {PROOF}: three steps, a free slot inside each of the vendor's three windows (Fri Oct 16 4:15pm, Tue Oct 20 2:00pm, Wed Oct 21 9:45am), all three offered. Defect 7 of the five-scenarios section: windows are searched inside their hours, not as a whole week.",
       'notes': "FOR BOB: the colleagues' calendars are not in any capture; both are modelled as readable and empty (world.colleagueCalendars), on the reading that the rehearsal peer accounts held nothing that evening. The windows' hours are Winnie's WORD_HOURS (afternoon 12 to 5, morning 9 to 12) and the vendor's 'between 1 and 3'. A slot matches when it starts and ends inside one window. Condition A's facts include the windows check the loop would run."}},
    {'index': 1, 'kind': 'reply', 'now': '2026-10-11T00:25:10.000Z', 'trigger': 'Harper Quill replied on the thread.',
     'add': {'thread': [{'from': HARPER, 'at': d['acceptSent']['at'], 'persona': 'accept-first'}]},
     'expect': {'decisionClass': 'book', 'firstStep': ['record_yes', 'book'], 'mustReach': [VENDOR], 'slotFrom': 'persona', 'tellBobMustMatch': 'card',
       'rulesInPlay': ['V1', 'V2', 'V5', 'V8', 'V9'],
       'basis': f"Plan 66 in {PROOF}: the vendor took the Friday (\"Friday at 4:15 pm works for me\"), and the loop booked it with the required peer on the hold, behind a card.",
       'notes': "The captured words are the accept-first persona's over her earliest offer; the expected slot is that offer, filled at run time. The required colleague rides on the booking automatically (prompt rule); book names the parties only."}},
  ]}
write('windows', sc)
print('ok')
