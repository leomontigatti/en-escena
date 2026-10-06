-- `Evaluar como profesional`: the academy asks the judges to be more severe.
-- A yes/no on the choreography that only the score heading reads; nothing
-- registered so far asked for it. See the `professionalEvaluation` entry in
-- CONTEXT.md.
ALTER TABLE "en_escena_choreography" ADD COLUMN "professional_evaluation" boolean DEFAULT false NOT NULL;