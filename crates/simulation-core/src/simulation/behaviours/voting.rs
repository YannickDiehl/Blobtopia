use super::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Voting behaviour: When an election is triggered, willing blobs vote.
pub struct VotingBehaviour {
    /// Whether an election is currently active
    election_active: AtomicBool,
    /// Last election results: votes per party [Fortschritt, Mitte, Tradition, Unabhängige]
    last_results: Mutex<[u32; 4]>,
}

impl VotingBehaviour {
    pub fn new() -> Self {
        VotingBehaviour {
            election_active: AtomicBool::new(false),
            last_results: Mutex::new([0; 4]),
        }
    }

    pub fn trigger_election(&self) {
        self.election_active.store(true, Ordering::SeqCst);
    }

    pub fn get_last_results(&self) -> [u32; 4] {
        *self.last_results.lock().unwrap()
    }
}

impl StepBehaviour for VotingBehaviour {
    fn apply(&self, phase: Phase, generation: &mut Generation, _sim: &Simulation) {
        if !self.election_active.load(Ordering::SeqCst) {
            return;
        }

        if let Phase::FINAL = phase {
            // Count votes
            let mut votes = [0u32; 4];

            for creature in generation.creatures.iter_mut().filter(|c| c.is_alive()) {
                if creature.political_state.will_vote {
                    if let Some(party) = creature.political_state.party_affiliation {
                        if (party as usize) < 4 {
                            votes[party as usize] += 1;
                        }
                        creature.political_state.last_vote = Some(party);
                    }
                }
            }

            *self.last_results.lock().unwrap() = votes;
            self.election_active.store(false, Ordering::SeqCst);
        }
    }
}
