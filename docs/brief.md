# App brief

Status: blank. `/new-app` fills this in with you; until then it describes the template itself.

<!--
What this app is for, written before any code. Claude reads it before planning a feature, so
keep it current: when the plan changes, change this file in the same PR.

It has two halves:
- WHAT the app does (functional requirements): who it's for, what they do, the features, and the
  things it stores.
- HOW WELL it must do it (non-functional, or "quality", requirements): privacy, scale, speed,
  devices, notifications, cost. Most apps take the defaults; only write down what's different.

You don't need system-design vocabulary. Plain sentences are best. "Not sure" is a fine answer:
put it under Open questions.
-->

## The idea

<!-- One sentence: what it is and who it's for. -->

## Who it's for

<!-- Who uses it, roughly how many in the first year, and what they're doing when they open it
(at a desk, on a phone on the go, once a week, all day…). "Just me" is a real answer. -->

## What they do with it

<!-- The 3–5 most important things someone does, as short journeys. Each is one line:
"Capture a note in under five seconds, from my phone".
These are what the first version must make easy; everything else serves them. -->

1.

## Features

<!-- Every feature you can think of, sorted by when. "First version" is the smallest set that
makes the app useful; be ruthless. Each first-version feature gets its own spec
(docs/specs/<feature>.md) before it's built. -->

| Feature | What it does, in one line | When |
|---|---|---|
| | | First version / Later / Not doing |

## What it remembers (the data)

<!-- The "things" the app stores, their important details, and how they relate. This becomes the
database schema, so it's worth getting roughly right. Example:
| Note | title, body, colour, pinned | belongs to one user; has many reminders |
| Reminder | when, done | belongs to one note | -->

| Thing | Important details | Belongs to / relates to |
|---|---|---|
| | | |

## Quality requirements

<!-- The defaults are what the template gives you with no extra work. Change a row only when this
app needs something different, and say why. -->

| Question | Default (the template) | This app |
|---|---|---|
| Who can see what? | Each user sees only their own data | |
| How many users in year one? | Up to a few thousand (free tiers) | |
| How fast? | Pages load in about a second; actions respond at once. The first visit after a quiet spell can take ~1s more while the database wakes | |
| Which devices? | Any modern browser, phone and desktop. No offline mode, no app-store app | |
| Notifications or scheduled work? | None. Email/push and background jobs aren't in the template yet | |
| Sensitive data? | None (no payments, health or ID documents) | |
| Accessibility | WCAG 2.2 AA, checked by axe in CI | |
| Languages and time zones | English; dates shown in the viewer's local time | |
| If something breaks | Hobby-level: no on-call. The database can be restored to an earlier point in time | |
| Other services | None. Uploads, payments and AI calls aren't in the template yet | |
| Cost | Free tiers of Vercel, Neon and GitHub | |

## What the template can't do yet

<!-- Anything above that needs a capability the template doesn't have (background jobs, email
or push notifications, file uploads, payments, real-time updates…). Each is extra work: decide
whether it's in the first version, later, or replaced by something simpler. -->

## Build order

<!-- First-version features in the order they'll be built. Each line becomes one PR (spec first,
then code), so each should be shippable on its own. -->

1.

## Open questions

<!-- Anything undecided. Answer them before building the feature they affect. -->
