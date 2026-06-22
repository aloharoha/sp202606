#pragma once
#include <string>
#include <vector>
#include <array>

struct FallingObject {
    std::string name;
    double mass;
    double cd;
    double area;
    double radius;
};

struct TargetObject {
    std::string name;
    double yieldStrength;
    double thickness;
    std::string material;
    std::string fractureMode;
};

struct SimInput {
    FallingObject falling;
    TargetObject  target;
    double height;
    double gravity;
};

struct PhysicsFrame {
    double time;
    double velocity;
    double altitude;
    double dragForce;
    double netForce;
    double airDensity;
    std::string atmosphere;
};

struct ImpactResult {
    double terminalVelocity;
    double impactVelocity;
    double impactMomentum;
    double impactForce;
    double impactPressure;
    double destructionRatio;
    std::string destructionLevel;
    std::vector<PhysicsFrame> trajectory;
};

struct Fragment {
    std::vector<float> vertices;
    std::vector<unsigned int> indices;
    std::array<float, 3> position;
    std::array<float, 3> velocity;
    std::array<float, 3> angularVelocity;
    std::array<float, 4> rotation;
    float mass;
    bool active;
};

struct DeformVertex {
    int index;
    float dx, dy, dz;
};

struct FractureResult {
    std::string mode;
    std::vector<Fragment> fragments;
    std::vector<DeformVertex> deformations;
    int dustParticleCount;
};

struct FragmentState {
    std::array<float, 3> position;
    std::array<float, 4> rotation;
    bool active;
};

class PhysicsEngine {
public:
    static std::vector<FallingObject> getPresetFallingObjects();
    static std::vector<TargetObject>  getPresetTargetObjects();
    static ImpactResult simulate(const SimInput& input);
    static FractureResult computeFracture(const ImpactResult& impact, const TargetObject& target, float objectRadius);
    static std::vector<FragmentState> stepFragments(std::vector<Fragment>& fragments, double dt, double gravity);
    static double calcAirDensity(double altitudeMeters);
    static std::string getAtmosphereName(double altitudeMeters);

private:
    static double calcTerminalVelocityAtAlt(const FallingObject& obj, double altitude, double gravity);
    static ImpactResult calcImpact(const SimInput& input, double impactVelocity, const std::vector<PhysicsFrame>& traj);
    static FractureResult computeShatter(const ImpactResult& impact, const TargetObject& target, float radius);
    static FractureResult computeFractureMode(const ImpactResult& impact, const TargetObject& target, float radius);
    static FractureResult computeDeform(const ImpactResult& impact, const TargetObject& target, float radius);
    static std::vector<float> buildConvexFragment(float cx, float cy, float cz, float size, int seed);
    static std::vector<unsigned int> buildFragmentIndices(int vertexCount);
};
