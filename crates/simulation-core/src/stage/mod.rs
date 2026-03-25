use nalgebra::Point2;
use rand::{rngs::SmallRng, Rng};

pub mod district_profile;
pub use district_profile::*;

pub mod blobtopia_stage;
pub use blobtopia_stage::*;

pub mod city;
pub use city::*;

pub struct Edge(pub Point2<f64>, pub Point2<f64>);

pub trait Stage: Send + Sync {
    // counter clockwise
    fn get_edges(&self) -> Vec<Edge>;
    // can this point be moved to?
    fn can_move_to(&self, to: &Point2<f64>) -> bool;
    fn get_center(&self) -> Point2<f64>;
    fn get_random_location(&self, rng: &mut SmallRng) -> Point2<f64>;
    fn get_nearest_edge_point(&self, pos: &Point2<f64>) -> Point2<f64>;
    fn constrain_within(&self, pos: &Point2<f64>) -> Point2<f64>;
}

// simple square
pub struct SquareStage(pub f64);

impl Stage for SquareStage {
    fn get_edges(&self) -> Vec<Edge> {
        vec![
            Edge(Point2::new(0., 0.), Point2::new(self.0, 0.)),
            Edge(Point2::new(self.0, 0.), Point2::new(self.0, self.0)),
            Edge(Point2::new(self.0, self.0), Point2::new(0., self.0)),
            Edge(Point2::new(0., self.0), Point2::new(0., 0.)),
        ]
    }

    fn can_move_to(&self, to: &Point2<f64>) -> bool {
        to.x >= 0. && to.y >= 0. && to.x <= self.0 && to.y <= self.0
    }

    fn get_center(&self) -> Point2<f64> {
        0.5 * Point2::new(self.0, self.0)
    }

    fn get_random_location(&self, rng: &mut SmallRng) -> Point2<f64> {
        let x = rng.gen_range(0.0..self.0);
        let y = rng.gen_range(0.0..self.0);
        Point2::new(x, y)
    }

    fn get_nearest_edge_point(&self, pos: &Point2<f64>) -> Point2<f64> {
        let hw = 0.5 * self.0;
        let x = if pos.x > hw { self.0 } else { 0. };
        let y = if pos.y > hw { self.0 } else { 0. };

        if (x - pos.x).abs() < (y - pos.y).abs() {
            Point2::new(x, pos.y)
        } else {
            Point2::new(pos.x, y)
        }
    }

    fn constrain_within(&self, pos: &Point2<f64>) -> Point2<f64> {
        let mut ret = *pos;
        ret.x = ret.x.max(0.).min(self.0);
        ret.y = ret.y.max(0.).min(self.0);
        ret
    }
}
