# Wiring: CMP "Creative Design" step → Experiment Design Reviewer agent

The `@experiment-design-reviewer` agent is invoked by an Opal **workflow**.
Webhooks in Opal are workflow-level triggers, not agent-level triggers — Opal
provides an inbound URL that external systems (here, Optimizely CMP) call to
start the workflow.

## End-to-end flow

```
CMP task moves into "Creative Design" step
  → CMP fires its outbound webhook (workflow settings → External tasks)
    → Opal receives at auto-generated webhook URL
      → Opal workflow runs
        → Workflow invokes @experiment-design-reviewer agent with task fields
          → Agent scores 8 axes, calls experiment-duration-estimator
          → Agent posts verdict to Slack via slack-notifier
```

## Setup steps

### 1. Opal — create the workflow

1. Opal Admin → **Workflows** → New workflow.
2. Name: `Experiment Design Review on Creative Design`.
3. Add a **Webhook trigger** node:
   - Name: `Creative Design Step Started`
   - Product Instance: `Content Marketing Platform`
   - Payload Content Type: `application/json`
   - Payload Schema: see `payload_schema` block below.
4. Add a **Condition** node after the trigger:
   - `payload.step.name == "Creative Design" && payload.step.status == "in_progress"`
   - This filters out unrelated step events on the same webhook.
5. Add the **@experiment-design-reviewer** agent node, mapping workflow
   payload onto agent inputs as described in `expected_inputs` in
   `opal-agent-experiment-design-reviewer.json`.
6. Save and **copy the auto-generated Webhook URL** from the trigger node.

### 2. CMP — configure the outbound webhook

1. Optimizely CMP → workflow settings for `Experimentation Workflow (Jira)`
   (the workflow shown in the screenshot) → **External tasks** /
   **Webhooks** → Add webhook.
2. URL: paste the Opal Webhook URL from step 1.6.
3. Trigger events: `task.step.status_changed` (or the closest equivalent
   exposed by CMP).
4. Authentication: configure per Opal's webhook settings — usually a shared
   secret or bearer token that Opal validates.
5. Save.

### 3. CMP — confirm the required task fields exist

The agent expects these fields on the CMP task. If your workflow template
doesn't already collect them, add them as custom fields on the task type:

| Agent input              | CMP field                          |
| ------------------------ | ---------------------------------- |
| hypothesis               | `fields.hypothesis`                |
| primary_metric           | `fields.primary_metric`            |
| guardrail_metrics        | `fields.guardrail_metrics`         |
| audience                 | `fields.audience`                  |
| baseline_rate            | `fields.baseline_rate` (decimal)   |
| mde_relative             | `fields.mde_relative` (decimal)    |
| proposed_duration_days   | `fields.proposed_duration_days`    |
| daily_traffic_per_variant| `fields.daily_traffic_per_variant` |
| variations               | `task.variations` (built-in)       |

Missing fields are not a hard failure — the agent will flag them as gaps and
lower the relevant axis scores.

## Payload schema for the Opal trigger

```json
{
  "type": "object",
  "properties": {
    "task": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "workflow_id": { "type": "string" },
        "variations": { "type": "array" },
        "fields": {
          "type": "object",
          "properties": {
            "hypothesis": { "type": "string" },
            "primary_metric": { "type": "string" },
            "guardrail_metrics": { "type": "array", "items": { "type": "string" } },
            "audience": { "type": "string" },
            "baseline_rate": { "type": "number" },
            "mde_relative": { "type": "number" },
            "proposed_duration_days": { "type": "number" },
            "daily_traffic_per_variant": { "type": "number" }
          }
        }
      },
      "required": ["id", "name", "workflow_id"]
    },
    "step": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "status": { "type": "string" }
      },
      "required": ["name", "status"]
    }
  },
  "required": ["task", "step"]
}
```

## Test plan

1. In CMP, open a test task on the Experimentation workflow with all fields
   populated. Move it into the **Creative Design** step.
2. Verify Opal shows the workflow run in its activity log.
3. Verify Slack `#experimentation-reviews` receives the verdict message.
4. Move a second task into Creative Design with `hypothesis` left blank —
   confirm the agent's output lists `hypothesis` as a gap and lowers that
   axis score.
5. Move a task into a different step (e.g. **Experiment QA**) — confirm the
   Condition node filters it out and the agent does NOT run.
