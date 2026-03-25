use rand::rngs::SmallRng;
use rand_distr::{Distribution, Normal};
use serde::{Deserialize, Serialize};

fn mutate(rng: &mut SmallRng, center: f64, variance: f64) -> f64 {
    let normal = Normal::new(center, variance).unwrap();
    normal.sample(rng)
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub struct Mutatable<T>(pub T, pub f64);
impl<T> Mutatable<T>
where
    T: std::convert::From<f64>,
    f64: std::convert::From<T>,
{
    #[allow(dead_code)]
    pub fn get_mutated(self, rng: &mut SmallRng) -> Self {
        let v = mutate(rng, self.0.into(), self.1.into());
        Self(v.into(), self.1)
    }
}
impl<T> From<Mutatable<T>> for (T, f64)
where
    T: std::convert::From<f64>,
    f64: std::convert::From<T>,
{
    fn from(m: Mutatable<T>) -> Self {
        (m.0, m.1)
    }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub struct PositiveMutatable<T>(pub T, pub f64);
impl<T> PositiveMutatable<T>
where
    T: std::convert::From<f64>,
    f64: std::convert::From<T>,
{
    pub fn get_mutated(self, rng: &mut SmallRng) -> Self {
        let v = mutate(rng, self.0.into(), self.1.into()).max(0.);
        Self(v.into(), self.1)
    }
}
impl<T> From<PositiveMutatable<T>> for (T, f64)
where
    T: std::convert::From<f64>,
    f64: std::convert::From<T>,
{
    fn from(m: PositiveMutatable<T>) -> Self {
        (m.0, m.1)
    }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub struct PositiveNonZeroMutatable<T>(pub T, pub f64);
impl<T> PositiveNonZeroMutatable<T>
where
    T: std::convert::From<f64>,
    f64: std::convert::From<T>,
{
    pub fn get_mutated(self, rng: &mut SmallRng) -> Self {
        let v = mutate(rng, self.0.into(), self.1.into()).max(f64::MIN_POSITIVE);
        Self(v.into(), self.1)
    }
}
impl<T> From<PositiveNonZeroMutatable<T>> for (T, f64)
where
    T: std::convert::From<f64>,
    f64: std::convert::From<T>,
{
    fn from(m: PositiveNonZeroMutatable<T>) -> Self {
        (m.0, m.1)
    }
}
