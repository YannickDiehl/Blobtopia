use rand::rngs::SmallRng;
use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use simulation_core::society::{Blob, SocietySnapshot};

const DISTRICT_NAMES: [&str; 5] = ["Grüntal", "Sonnenberg", "Hafenviertel", "Mittelfeld", "Industriezone"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlobTwitterPost {
    pub id: Uuid,
    pub author_id: Uuid,
    pub author_district: u8,
    pub content: String,
    pub tick: u32,
    pub year: u32,
    pub month: u32,
    pub day: u32,
    pub sentiment: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GazetteArticle {
    pub id: Uuid,
    pub headline: String,
    pub body: String,
    pub tick: u32,
    pub year: u32,
    pub month: u32,
    pub day: u32,
    pub topic: String,
}

const MAX_TWEETS_IN_MEMORY: usize = 500;
const MAX_ARTICLES_IN_MEMORY: usize = 200;

pub struct ArtifactGenerator {
    pub tweets: Vec<BlobTwitterPost>,
    pub articles: Vec<GazetteArticle>,
}

impl ArtifactGenerator {
    pub fn new() -> Self {
        ArtifactGenerator {
            tweets: Vec::new(),
            articles: Vec::new(),
        }
    }

    /// Generate artifacts from a society snapshot.
    pub fn generate_for_generation_society(
        &mut self,
        snapshot: &SocietySnapshot,
        rng: &mut SmallRng,
    ) {
        let blobs = &snapshot.blobs;
        if blobs.is_empty() {
            return;
        }

        // Generate 2-4 tweets per tick
        let tweet_count = rng.gen_range(2..=4).min(blobs.len());
        let mut indices: Vec<usize> = (0..blobs.len()).collect();
        indices.shuffle(rng);

        for &idx in indices.iter().take(tweet_count) {
            let tweet = self.generate_tweet_from_glob(&blobs[idx], snapshot.tick, snapshot.year, snapshot.month, snapshot.day, rng);
            self.tweets.push(tweet);
        }

        // Trim tweets to max
        if self.tweets.len() > MAX_TWEETS_IN_MEMORY {
            let excess = self.tweets.len() - MAX_TWEETS_IN_MEMORY;
            self.tweets.drain(0..excess);
        }

        // Generate articles for events
        for event_desc in &snapshot.events_processed {
            let article = GazetteArticle {
                id: Uuid::new_v4(),
                headline: event_desc.clone(),
                body: format!(
                    "In Jahr {} der Blobtopia-Geschichte: {}. Die Bürger reagieren mit gemischten Gefühlen.",
                    snapshot.year, event_desc
                ),
                tick: snapshot.tick,
                year: snapshot.year,
                month: snapshot.month,
                day: snapshot.day,
                topic: "event".to_string(),
            };
            self.articles.push(article);
        }

        // Election results article
        if let Some(results) = &snapshot.election_results {
            let total: u32 = results.iter().sum();
            let winner_idx = results.iter().enumerate().max_by_key(|(_, v)| *v).map(|(i, _)| i).unwrap_or(0);
            let party_names = ["Fortschritt", "Mitte", "Tradition", "Unabhängige"];
            let winner = party_names[winner_idx];

            let article = GazetteArticle {
                id: Uuid::new_v4(),
                headline: format!("Wahlergebnis: {} gewinnt mit {}% der Stimmen", winner, if total > 0 { results[winner_idx] * 100 / total } else { 0 }),
                body: format!(
                    "Die Wahl in Blobtopia ist entschieden! Ergebnisse: \
                     Fortschritt: {} Stimmen, Mitte: {} Stimmen, Tradition: {} Stimmen, Unabhängige: {} Stimmen. \
                     Insgesamt haben {} von {} Bürgern ihre Stimme abgegeben.",
                    results[0], results[1], results[2], results[3],
                    total, snapshot.blobs.len()
                ),
                tick: snapshot.tick,
                year: snapshot.year,
                month: snapshot.month,
                day: snapshot.day,
                topic: "election".to_string(),
            };
            self.articles.push(article);
        }

        // Trim articles to max
        if self.articles.len() > MAX_ARTICLES_IN_MEMORY {
            let excess = self.articles.len() - MAX_ARTICLES_IN_MEMORY;
            self.articles.drain(0..excess);
        }
    }

    fn generate_tweet_from_glob(
        &self,
        glob: &Blob,
        tick: u32,
        year: u32,
        month: u32,
        day: u32,
        rng: &mut SmallRng,
    ) -> BlobTwitterPost {
        let district_name = DISTRICT_NAMES.get(glob.district as usize).unwrap_or(&"Unbekannt");
        let sentiment = (glob.attitudes.political_satisfaction - 5.0) / 5.0;

        let templates_positive = [
            format!("Schöner Tag in {}! Das Leben ist gut. #Blobtopia", district_name),
            format!("Bin zufrieden mit der aktuellen Lage. Weiter so! #{}", district_name),
            format!("Gerade auf dem Marktplatz gewesen. Tolles Angebot heute!"),
            format!("{} ist der beste Distrikt! #Heimat", district_name),
            format!("Jahr {} in Blobtopia — ich bin optimistisch! 🌟", year),
        ];

        let templates_neutral = [
            format!("Ganz normaler Tag in {}. Nichts besonderes los.", district_name),
            format!("Hat jemand Tipps für gutes Essen in der Nähe vom Marktplatz?"),
            format!("Die Uni hat heute einen Vortrag. Interessant."),
            format!("Wetter in {} ist okay heute.", district_name),
            format!("Noch {} Jahre bis... ja, bis was eigentlich? #Blobtopia", 15 - year),
        ];

        let templates_negative = [
            format!("In {} wird es immer schwieriger! Wann tut die Regierung endlich was?", district_name),
            format!("Mein Einkommen reicht kaum noch. So kann es nicht weitergehen! #{}", district_name),
            format!("Vertrauen in die Politik? Fehlanzeige. #Enttäuscht"),
            format!("Protest wäre mal angebracht. Wer ist dabei? #Blobtopia"),
            format!("Die da oben haben keine Ahnung was hier in {} los ist!", district_name),
        ];

        let content = if sentiment > 0.2 {
            templates_positive[rng.gen_range(0..templates_positive.len())].clone()
        } else if sentiment < -0.2 {
            templates_negative[rng.gen_range(0..templates_negative.len())].clone()
        } else {
            templates_neutral[rng.gen_range(0..templates_neutral.len())].clone()
        };

        BlobTwitterPost {
            id: Uuid::new_v4(),
            author_id: glob.id,
            author_district: glob.district,
            content,
            tick,
            year,
            month,
            day,
            sentiment,
        }
    }

    pub fn recent_tweets(&self, n: usize) -> Vec<&BlobTwitterPost> {
        self.tweets.iter().rev().take(n).collect()
    }

    pub fn all_articles(&self) -> &[GazetteArticle] {
        &self.articles
    }
}
