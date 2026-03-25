use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};

use super::blob::Blob;

/// What a Blob is doing at a given hour.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Activity {
    Sleeping,
    Commuting,
    Working,
    LunchBreak,
    Shopping,
    Socializing,
    Leisure,
    Strolling,
    Protesting,
    GoingHome,
}

/// A single entry in a daily schedule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleEntry {
    pub hour: f32,
    pub activity: Activity,
    /// The building the Blob is at (or heading to) during this activity.
    pub building_id: Option<u32>,
}

/// The complete daily schedule for a Blob.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailySchedule {
    pub entries: Vec<ScheduleEntry>,
}

/// What kind of day it is — determines schedule template.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DayType {
    Weekday,
    Weekend,
    ElectionDay,
    ProtestDay,
}

impl DayType {
    /// Determine day type from tick number and flags.
    pub fn from_tick(tick: u32, is_election: bool, is_protest: bool) -> Self {
        if is_election {
            return DayType::ElectionDay;
        }
        if is_protest {
            return DayType::ProtestDay;
        }
        // 7-day week: ticks 0-4 = weekday, 5-6 = weekend
        let day_of_week = tick % 7;
        if day_of_week >= 5 {
            DayType::Weekend
        } else {
            DayType::Weekday
        }
    }
}

impl DailySchedule {
    /// Generate a weekday schedule for a Blob.
    /// Ported from blob.js `_buildSchedule()`.
    pub fn weekday(blob: &Blob, lunch_hour: f32, rng: &mut SmallRng) -> Self {
        let age = blob.age_group();
        let edu = blob.education_level;
        let income = blob.income_normalized();
        let protest_readiness = blob.political_state.protest_readiness;

        // Small per-blob variation (deterministic within a day via rng)
        let var: f64 = rng.gen(); // 0.0–1.0, replaces JS `this._phase`

        // ── Wake time: older wake earlier, young sleep in ──
        let wake_hour: f32 = match age {
            0 => if var > 0.6 { 8.0 } else { 7.0 },       // young: 7-8
            2 => if var > 0.5 { 6.0 } else { 5.5 },       // older: 5:30-6
            _ => if var > 0.6 { 7.0 } else { 6.0 },       // middle: 6-7
        };

        // ── Work start: academics start later, factory workers early ──
        let work_start: f32 = match edu {
            3 => wake_hour + 2.0,       // academics: 8-10
            0 => wake_hour + 0.5,       // labor: right after waking
            _ => wake_hour + 1.0,       // default: +1h after wake
        };

        // ── Lunch: from district profile (e.g. 11.0 for shift workers, 12.0 default) ──
        let lunch_start: f32 = lunch_hour;
        let lunch_end: f32 = if income > 7.0 {
            lunch_start + 1.5   // wealthy: long lunch
        } else {
            lunch_start + 1.0   // standard: 1h
        };

        // ── Work end: varies by job type ──
        let work_end: f32 = match edu {
            3 => if var > 0.5 { 17.0 } else { 16.0 },     // academics: 16-17
            0 => if var > 0.6 { 16.0 } else { 15.0 },     // labor: 15-16
            _ => if var > 0.8 { 18.0 } else { 17.0 },     // office: 17-18
        };

        // ── Evening: young stay out late, older go home early ──
        let home_hour: f32 = match age {
            0 => if var > 0.5 { 22.0 } else { 21.0 },     // young: 21-22
            2 => 19.0,                                       // older: 19
            _ => if protest_readiness > 0.5 { 21.0 } else { 20.0 }, // middle: 20-21
        };

        let sleep_hour: f32 = match age {
            0 => if var > 0.6 { 24.0 } else { 23.0 },     // young: 23-24
            2 => 21.0,                                       // older: 21
            _ => if var > 0.8 { 23.0 } else { 22.0 },     // middle: 22-23
        };

        // ── Strolling phase: after work, before settling at leisure spot ──
        let stroll_end: f32 = (work_end + 1.5).min(home_hour - 0.5);

        let entries = vec![
            ScheduleEntry { hour: 0.0,        activity: Activity::Sleeping,   building_id: blob.home_building_id },
            ScheduleEntry { hour: wake_hour,   activity: Activity::Commuting,  building_id: blob.workplace_id },
            ScheduleEntry { hour: work_start,  activity: Activity::Working,    building_id: blob.workplace_id },
            ScheduleEntry { hour: lunch_start, activity: Activity::LunchBreak, building_id: blob.lunch_spot_id },
            ScheduleEntry { hour: lunch_end,   activity: Activity::Working,    building_id: blob.workplace_id },
            ScheduleEntry { hour: work_end,    activity: Activity::Strolling,  building_id: None },
            ScheduleEntry { hour: stroll_end,  activity: Activity::Leisure,    building_id: blob.leisure_spot_id },
            ScheduleEntry { hour: home_hour,   activity: Activity::GoingHome,  building_id: blob.home_building_id },
            ScheduleEntry { hour: sleep_hour,  activity: Activity::Sleeping,   building_id: blob.home_building_id },
        ];

        DailySchedule { entries }
    }

    /// Generate a weekend schedule (no work, more leisure/social).
    pub fn weekend(blob: &Blob, rng: &mut SmallRng) -> Self {
        let age = blob.age_group();
        let income = blob.income_normalized();
        let var: f64 = rng.gen();

        let wake_hour: f32 = match age {
            0 => if var > 0.5 { 10.0 } else { 9.0 },      // young: sleep in
            2 => if var > 0.5 { 6.5 } else { 6.0 },       // older: habit
            _ => if var > 0.5 { 9.0 } else { 8.0 },       // middle: 8-9
        };

        // Morning leisure (park, sports, shopping)
        let morning_activity = if age == 0 {
            Activity::Leisure       // young: sports/park
        } else if income > 6.0 {
            Activity::Shopping      // affluent: shopping
        } else {
            Activity::Socializing   // social meetup
        };

        let lunch_hour: f32 = 12.0;
        let afternoon_hour: f32 = 14.0;

        // Afternoon: socializing or more leisure
        let afternoon_activity = if age == 0 {
            Activity::Socializing
        } else {
            Activity::Leisure
        };

        let home_hour: f32 = match age {
            0 => if var > 0.5 { 22.0 } else { 21.0 },
            2 => 18.0,
            _ => 20.0,
        };

        let sleep_hour: f32 = match age {
            0 => 23.5,
            2 => 21.0,
            _ => 22.5,
        };

        // ── Morning stroll before main activity ──
        let stroll_start: f32 = wake_hour + 0.5;
        let stroll_end: f32 = stroll_start + 1.5;

        let entries = vec![
            ScheduleEntry { hour: 0.0,             activity: Activity::Sleeping,      building_id: blob.home_building_id },
            ScheduleEntry { hour: stroll_start,     activity: Activity::Strolling,     building_id: None },
            ScheduleEntry { hour: stroll_end,       activity: morning_activity,        building_id: blob.leisure_spot_id },
            ScheduleEntry { hour: lunch_hour,       activity: Activity::LunchBreak,    building_id: blob.lunch_spot_id },
            ScheduleEntry { hour: afternoon_hour,   activity: afternoon_activity,      building_id: blob.leisure_spot_id },
            ScheduleEntry { hour: home_hour,        activity: Activity::GoingHome,     building_id: blob.home_building_id },
            ScheduleEntry { hour: sleep_hour,       activity: Activity::Sleeping,      building_id: blob.home_building_id },
        ];

        DailySchedule { entries }
    }

    /// Generate a protest/election day schedule.
    /// Globs with high protest readiness go to civic center; others have normal-ish day.
    pub fn event_day(blob: &Blob, civic_building_id: Option<u32>, rng: &mut SmallRng) -> Self {
        let protest_readiness = blob.political_state.protest_readiness;
        let will_participate = protest_readiness > 0.3 || blob.political_state.will_vote;

        if will_participate {
            let _var: f64 = rng.gen(); // consume rng for consistency
            let wake_hour: f32 = match blob.age_group() {
                0 => 8.0,
                2 => 6.0,
                _ => 7.0,
            };
            let event_start: f32 = 10.0;
            let event_end: f32 = if protest_readiness > 0.7 { 18.0 } else { 15.0 };
            let go_home: f32 = event_end + 1.0;
            let sleep_hour: f32 = if blob.age_group() == 0 { 23.0 } else { 22.0 };

            let entries = vec![
                ScheduleEntry { hour: 0.0,         activity: Activity::Sleeping,    building_id: blob.home_building_id },
                ScheduleEntry { hour: wake_hour,    activity: Activity::Commuting,   building_id: civic_building_id },
                ScheduleEntry { hour: event_start,  activity: Activity::Protesting,  building_id: civic_building_id },
                ScheduleEntry { hour: 12.5,         activity: Activity::LunchBreak,  building_id: blob.lunch_spot_id },
                ScheduleEntry { hour: 13.5,         activity: Activity::Protesting,  building_id: civic_building_id },
                ScheduleEntry { hour: go_home,      activity: Activity::GoingHome,   building_id: blob.home_building_id },
                ScheduleEntry { hour: sleep_hour,   activity: Activity::Sleeping,    building_id: blob.home_building_id },
            ];
            DailySchedule { entries }
        } else {
            // Not participating — have a normal-ish weekend
            Self::weekend(blob, rng)
        }
    }

    /// Generate a weekday schedule for a child (no work — school/home/leisure).
    pub fn child_weekday(blob: &Blob, rng: &mut SmallRng) -> Self {
        let _var: f64 = rng.gen(); // consume rng for consistency

        // Children go to their leisure spot (stands in for school), come home in the afternoon
        let wake_hour: f32 = 7.0;
        let school_start: f32 = 8.0;
        let school_end: f32 = 13.0; // German half-day school model
        let afternoon_hour: f32 = 14.0;
        let home_hour: f32 = 18.0;
        let sleep_hour: f32 = 21.0;

        let stroll_end: f32 = 15.5;

        let entries = vec![
            ScheduleEntry { hour: 0.0,             activity: Activity::Sleeping,     building_id: blob.home_building_id },
            ScheduleEntry { hour: wake_hour,        activity: Activity::Commuting,    building_id: blob.leisure_spot_id },
            ScheduleEntry { hour: school_start,     activity: Activity::Socializing,  building_id: blob.leisure_spot_id },
            ScheduleEntry { hour: school_end,       activity: Activity::GoingHome,    building_id: blob.home_building_id },
            ScheduleEntry { hour: afternoon_hour,   activity: Activity::Strolling,    building_id: None },
            ScheduleEntry { hour: stroll_end,       activity: Activity::Leisure,      building_id: blob.leisure_spot_id },
            ScheduleEntry { hour: home_hour,        activity: Activity::GoingHome,    building_id: blob.home_building_id },
            ScheduleEntry { hour: sleep_hour,       activity: Activity::Sleeping,     building_id: blob.home_building_id },
        ];

        DailySchedule { entries }
    }

    /// Generate the appropriate schedule for a given day type.
    pub fn for_day(blob: &Blob, day_type: DayType, civic_building_id: Option<u32>, lunch_hour: f32, rng: &mut SmallRng) -> Self {
        // Children get a special schedule (no work)
        if blob.is_child() {
            return match day_type {
                DayType::Weekday => Self::child_weekday(blob, rng),
                _ => Self::weekend(blob, rng), // weekends/events: same as adults
            };
        }

        match day_type {
            DayType::Weekday => Self::weekday(blob, lunch_hour, rng),
            DayType::Weekend => Self::weekend(blob, rng),
            DayType::ElectionDay | DayType::ProtestDay => {
                Self::event_day(blob, civic_building_id, rng)
            }
        }
    }

    /// Get the activity at a given hour (binary search, matching JS _getScheduledState).
    pub fn activity_at(&self, hour: f32) -> Activity {
        let mut current = Activity::Sleeping;
        for entry in &self.entries {
            if hour >= entry.hour {
                current = entry.activity;
            } else {
                break;
            }
        }
        current
    }

    /// Get the building_id at a given hour.
    pub fn building_at(&self, hour: f32) -> Option<u32> {
        let mut current = None;
        for entry in &self.entries {
            if hour >= entry.hour {
                current = entry.building_id;
            } else {
                break;
            }
        }
        current
    }
}
