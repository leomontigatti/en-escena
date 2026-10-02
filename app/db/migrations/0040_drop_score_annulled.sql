-- reason: contract step of the score annulment retired in #1388; no code reads "annulled" since then, and #1388, #1389 and this ship together in a window with nobody using the app, so no old container queries the column during the deploy.
-- squawk-ignore ban-drop-column
ALTER TABLE "en_escena_score" DROP COLUMN "annulled";
