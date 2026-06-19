-- Multi-slot proposals: a single proposal can offer several time options that
-- the recipient picks from. slot_start/slot_end still hold the first (or chosen)
-- slot for backward compatibility and confirmed bookings.
ALTER TABLE scheduling_proposals
  ADD COLUMN IF NOT EXISTS proposed_slots jsonb NOT NULL DEFAULT '[]';
