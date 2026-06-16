# Cater Vegas -> BEOFlow Sync

This bridge keeps Cater Vegas as Rod's operating app and BEOFlow as the Bastida client brain.

## 1. Update the BEOFlow database

Run `supabase/beoflow_cater_sync_schema.sql` in the BEOFlow Supabase project.

That adds:

- `beoflow_events.source`, `source_id`, `source_metadata`, `last_synced_at`
- `beoflow_activity_log`
- RLS policies for the new activity log

## 2. Configure Cater Edge Function secrets

Set these secrets in the Cater Vegas Supabase project:

```bash
supabase secrets set \
  BEOFLOW_SUPABASE_URL="https://YOUR_BEOFLOW_PROJECT_ID.supabase.co" \
  BEOFLOW_SERVICE_ROLE_KEY="YOUR_BEOFLOW_SERVICE_ROLE_KEY" \
  BEOFLOW_CLIENT_NAME="Cater Vegas"
```

`BEOFLOW_SERVICE_ROLE_KEY` must be the BEOFlow service role key. Do not put it in frontend files.

## 3. Deploy Cater Edge Function

```bash
supabase functions deploy beoflow
```

## 4. Expected result

When an admin creates a Cater event, the admin UI calls the `beoflow` Edge Function with `action: "sync-event"`.

The function:

1. Validates the Cater user can access the event.
2. Reads the Cater event from `cater_events`.
3. Upserts the matching BEOFlow event by `client_id + source + source_id`.
4. Upserts a BEOFlow activity log row.

Rod does not need BEOFlow login access. Bastida sees the client, synced events, and activity inside BEOFlow.
