-- The retention of en_escena_unexpected_error (#987): 90 days, since the rows
-- hold user ids. Run by scripts/unexpected-error-maintenance.sh; prints how
-- many rows it deleted.
with deleted as (
  delete from en_escena_unexpected_error
  where created_at < now() - interval '90 days'
  returning 1
)
select count(*) from deleted;
