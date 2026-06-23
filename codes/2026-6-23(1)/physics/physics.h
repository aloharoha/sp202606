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
    double v0;
    double windX;
    double windZ;
    double tempOffset;
    double humidity;
    // [F7] Magnus / Spin
    double spinRate;    // 각속도 (rad/s), 0 = 없음
    double spinAxisX;
    double spinAxisY;
    double spinAxisZ;
    // [F13] Projectile
    double launchAngle;   // 발사각 °, 90 = 수직 낙하(기본)
    double launchAzimuth; // 수평 방향 °, 0 = 북쪽
    // [F12] Terrain
    double terrainSlope;  // 경사각 °, 0 = 수평
};

struct PhysicsFrame {
    double time;
    double velocity;
    double altitude;
    double dragForce;
    double netForce;
    double airDensity;
    std::string atmosphere;
    double posX;
    double posZ;
};

struct ImpactResult {
    double terminalVelocity;
    double impactVelocity;
    double impactMomentum;
    double impactForce;
    double impactPressure;
    double impactEnergy;    // [F9] 충돌 운동에너지 (J)
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
    static double calcAirDensity(double altitudeMeters, double tempOffset = 0.0, double humidity = 50.0);
    static std::string getAtmosphereName(double altitudeMeters);

private:
    static double calcTerminalVelocityAtAlt(const FallingObject& obj, double altitude, double gravity, double tempOffset = 0.0, double humidity = 50.0);
    static ImpactResult calcImpact(const SimInput& input, double impactVelocity, const std::vector<PhysicsFrame>& traj);
    static FractureResult computeShatter(const ImpactResult& impact, const TargetObject& target, float radius);
    static FractureResult computeFractureMode(const ImpactResult& impact, const TargetObject& target, float radius);
    static FractureResult computeDeform(const ImpactResult& impact, const TargetObject& target, float radius);
    static std::vector<float> buildConvexFragment(float cx, float cy, float cz, float size, int seed);
    static std::vector<unsigned int> buildFragmentIndices(int vertexCount);
};
