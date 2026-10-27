-- Name the rule, so the API can explain it when a settings change breaks it.
ALTER TABLE properties RENAME CONSTRAINT properties_check TO properties_stay_lengths;
