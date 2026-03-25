/// Sensitivity test: Run a lightweight simulation (no city/DB) and print
/// district-level latent trait means at yearly intervals.
/// Now includes events to test asymmetric response (Scenario 1+2).

use simulation_core::society::{BlobtopiaSim, BlobtopiaEvent, SocietyConfig};

fn main() {
    let seed: u64 = 118;
    let glob_count: usize = 500;
    let config = SocietyConfig {
        max_years: 15,
        ..SocietyConfig::default()
    };
    let total_ticks = config.ticks_per_year * config.max_years;

    let mut sim = BlobtopiaSim::new(seed, glob_count, config);
    println!("Initialized: {} blobs", sim.blobs.len());

    // Schedule events to test asymmetric response
    let events: Vec<(u32, BlobtopiaEvent)> = vec![
        (400, BlobtopiaEvent::EconomicCrisis { severity: 0.5, affected_districts: vec![] }),
        (1200, BlobtopiaEvent::EconomicBoom { magnitude: 0.6, affected_districts: vec![] }),
        (1460, BlobtopiaEvent::Election),
        (1800, BlobtopiaEvent::Scandal { target_party: 1, magnitude: 0.7 }),
        (2500, BlobtopiaEvent::EconomicCrisis { severity: 0.4, affected_districts: vec![] }),
        (2920, BlobtopiaEvent::Election),
        (3200, BlobtopiaEvent::EconomicBoom { magnitude: 0.5, affected_districts: vec![] }),
        (4000, BlobtopiaEvent::Scandal { target_party: 2, magnitude: 0.5 }),
        (4380, BlobtopiaEvent::Election),
    ];
    let mut event_iter = events.iter().peekable();

    let district_names = ["Grüntal", "Sonnenberg", "Hafenviertel", "Mittelfeld", "Industriezone"];

    // Print header
    println!("\n{}", "=".repeat(120));
    println!("LATENT TRAIT DISTRICT MEANS OVER TIME");
    println!("{}", "=".repeat(120));

    // Traits to track
    let trait_names = [
        "Obedience", "RuleConf", "StrongLdr",  // Authoritarianism
        "SelfEff", "PolKnow", "VoteImp",        // Efficacy
        "Powerless", "PolCompl", "PartyInd",     // Alienation
        "EconSec", "EnvEcon", "FreeOrder",       // Materialism
    ];

    // Print initial state
    print_state("Year  0", &sim, &district_names, &trait_names);

    for tick in 1..=total_ticks {
        // Queue events scheduled for this tick
        while let Some(&&(event_tick, ref event)) = event_iter.peek() {
            if event_tick == tick {
                sim.queue_event(event.clone());
                event_iter.next();
            } else {
                break;
            }
        }

        sim.tick();

        // Print every year
        if tick % 365 == 0 {
            let year = tick / 365;
            print_state(&format!("Year {:2}", year), &sim, &district_names, &trait_names);
        }
    }

    // Print summary: change from year 0 to year 15 per district
    println!("\n{}", "=".repeat(120));
    println!("SUMMARY: Key trait divergence (Year 0 → Year 15)");
    println!("{}", "=".repeat(120));
    println!("\nSee above for full trajectory. Key indicators of success:");
    println!("  - Districts should DIVERGE, not converge");
    println!("  - Authoritarianism: Industriezone/Grüntal should INCREASE, Sonnenberg DECREASE");
    println!("  - Efficacy: Sonnenberg should INCREASE, Industriezone should DECREASE");
    println!("  - Alienation: Industriezone should INCREASE, Sonnenberg should STAY LOW");
}

fn print_state(label: &str, sim: &BlobtopiaSim, district_names: &[&str; 5], trait_names: &[&str; 12]) {
    // Compute district means for all tracked traits
    let mut sums = [[0.0f64; 12]; 5];
    let mut counts = [0u32; 5];

    for blob in &sim.blobs {
        let d = blob.district as usize;
        if d >= 5 { continue; }
        counts[d] += 1;
        sums[d][0] += blob.latent_traits.obedience_value;
        sums[d][1] += blob.latent_traits.rule_conformity;
        sums[d][2] += blob.latent_traits.strong_leader_preference;
        sums[d][3] += blob.latent_traits.self_efficacy;
        sums[d][4] += blob.latent_traits.political_knowledge;
        sums[d][5] += blob.latent_traits.vote_importance;
        sums[d][6] += blob.latent_traits.powerlessness;
        sums[d][7] += blob.latent_traits.political_complexity;
        sums[d][8] += blob.latent_traits.party_indifference;
        sums[d][9] += blob.latent_traits.economic_security_priority;
        sums[d][10] += blob.latent_traits.environment_over_economy;
        sums[d][11] += blob.latent_traits.freedom_over_order;
    }

    println!("\n--- {} ---", label);
    // Print header row
    print!("{:<14}", "District");
    for name in trait_names {
        print!("{:>10}", name);
    }
    println!();

    for d in 0..5 {
        if counts[d] == 0 { continue; }
        print!("{:<14}", district_names[d]);
        for t in 0..12 {
            print!("{:>10.2}", sums[d][t] / counts[d] as f64);
        }
        println!();
    }

    // Also print attitude means for context
    let mut att_sums = [[0.0f64; 3]; 5];
    for blob in &sim.blobs {
        let d = blob.district as usize;
        if d >= 5 { continue; }
        att_sums[d][0] += blob.attitudes.political_satisfaction;
        att_sums[d][1] += blob.attitudes.ideology;
        att_sums[d][2] += blob.attitudes.institutional_trust;
    }
    print!("{:<14}", "  Attitudes:");
    print!("{:>10}", "Satisf");
    print!("{:>10}", "Ideology");
    print!("{:>10}", "Trust");
    println!();
    for d in 0..5 {
        if counts[d] == 0 { continue; }
        print!("{:<14}", district_names[d]);
        print!("{:>10.2}", att_sums[d][0] / counts[d] as f64);
        print!("{:>10.2}", att_sums[d][1] / counts[d] as f64);
        print!("{:>10.2}", att_sums[d][2] / counts[d] as f64);
        println!();
    }
}
