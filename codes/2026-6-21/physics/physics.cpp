#define _USE_MATH_DEFINES
#include "physics.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <random>
#include <numeric>

std::vector<FallingObject> PhysicsEngine::getPresetFallingObjects() {
    return {
        {"Bowling Ball",     7.0,    0.47, 0.0573, 0.135},
        {"Human (Freefall)", 70.0,   1.0,  0.70,   0.30},
        {"Small Car",        1200.0, 0.30, 2.20,   0.90},
        {"Meteor (1m)",      2000.0, 0.47, 0.785,  0.50},
        {"Piano",            300.0,  1.20, 1.50,   0.70},
        {"Refrigerator",     80.0,   1.05, 0.60,   0.40},
        {"Iron Ball (50cm)", 500.0,  0.47, 0.196,  0.25},
    };
}

std::vector<TargetObject> PhysicsEngine::getPresetTargetObjects() {
    return {
        {"Wooden Board",   40.0,  0.05, "wood",     "fracture"},
        {"Concrete Floor", 30.0,  0.20, "concrete", "fracture"},
        {"Steel Plate",    250.0, 0.01, "steel",    "deform"},
        {"Glass",          7.0,   0.006,"glass",    "shatter"},
        {"Brick Wall",     10.0,  0.20, "brick",    "fracture"},
        {"Car Roof",       180.0, 0.002,"steel",    "deform"},
    };
}

double PhysicsEngine::calcTerminalVelocity(
    const FallingObject& obj, double airDensity, double gravity)
{
    return std::sqrt((2.0 * obj.mass * gravity) / (airDensity * obj.cd * obj.area));
}

ImpactResult PhysicsEngine::simulate(const SimInput& input) {
    if (input.height <= 0)
        throw std::invalid_argument("Height must be greater than 0.");

    const double g   = input.gravity;
    const double rho = input.airDensity;
    const FallingObject& obj = input.falling;

    double vt       = calcTerminalVelocity(obj, rho, g);
    const double dt = 0.05;
    double v        = 0.0;
    double altitude = input.height;
    double t        = 0.0;

    std::vector<PhysicsFrame> traj;
    traj.reserve(static_cast<int>(input.height / (v + 1) * 20) + 200);

    while (altitude > 0.0) {
        double drag  = 0.5 * rho * obj.cd * obj.area * v * v;
        double netF  = obj.mass * g - drag;
        double accel = netF / obj.mass;

        PhysicsFrame frame;
        frame.time      = t;
        frame.velocity  = v;
        frame.altitude  = altitude;
        frame.dragForce = drag;
        frame.netForce  = netF;
        traj.push_back(frame);

        v        += accel * dt;
        altitude -= v * dt;
        t        += dt;

        if (v >= vt * 0.999) {
            v = vt;
            while (altitude > 0.0) {
                PhysicsFrame f2;
                f2.time      = t;
                f2.velocity  = vt;
                f2.altitude  = altitude;
                f2.dragForce = obj.mass * g;
                f2.netForce  = 0.0;
                traj.push_back(f2);
                altitude -= vt * dt;
                t        += dt;
            }
            break;
        }
    }

    double impactV = traj.empty() ? v : traj.back().velocity;
    return calcImpact(input, impactV, traj);
}

ImpactResult PhysicsEngine::calcImpact(
    const SimInput& input, double impactVelocity,
    const std::vector<PhysicsFrame>& traj)
{
    const FallingObject& obj    = input.falling;
    const TargetObject&  target = input.target;

    double J             = obj.mass * impactVelocity;
    double collisionTime = 0.05 / (1.0 + target.yieldStrength / 50.0);
    collisionTime        = std::clamp(collisionTime, 0.001, 0.05);
    double F_avg         = J / collisionTime;
    double contactArea   = M_PI * obj.radius * obj.radius;
    double pressure_Pa   = F_avg / contactArea;
    double pressure_MPa  = pressure_Pa / 1e6;
    double rawRatio      = pressure_MPa / target.yieldStrength;
    double destructionRatio = 1.0 / (1.0 + std::exp(-2.5 * (rawRatio - 1.0)));

    std::string level;
    if (destructionRatio < 0.20)       level = "No Damage";
    else if (destructionRatio < 0.45)  level = "Minor Damage";
    else if (destructionRatio < 0.70)  level = "Moderate Damage";
    else if (destructionRatio < 0.90)  level = "Severe Damage";
    else                               level = "Total Destruction";

    ImpactResult result;
    result.terminalVelocity = calcTerminalVelocity(input.falling, input.airDensity, input.gravity);
    result.impactVelocity   = impactVelocity;
    result.impactMomentum   = J;
    result.impactForce      = F_avg;
    result.impactPressure   = pressure_MPa;
    result.destructionRatio = destructionRatio;
    result.destructionLevel = level;
    result.trajectory       = traj;
    return result;
}

std::vector<float> PhysicsEngine::buildConvexFragment(float cx, float cy, float cz, float size, int seed) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> jitter(-size * 0.4f, size * 0.4f);
    std::uniform_real_distribution<float> scale(0.5f, 1.0f);

    std::vector<float> verts;
    int faces = 6 + (seed % 5);
    for (int i = 0; i < faces; i++) {
        float theta = (float)i / faces * 2.0f * (float)M_PI;
        for (int j = 0; j < 3; j++) {
            float phi = ((float)j / 3.0f - 0.5f) * (float)M_PI;
            float r   = size * scale(rng);
            float x   = cx + r * std::cos(phi) * std::cos(theta) + jitter(rng);
            float y   = cy + r * std::sin(phi) + jitter(rng);
            float z   = cz + r * std::cos(phi) * std::sin(theta) + jitter(rng);
            verts.push_back(x);
            verts.push_back(y);
            verts.push_back(z);
        }
    }
    return verts;
}

std::vector<unsigned int> PhysicsEngine::buildFragmentIndices(int vertexCount) {
    std::vector<unsigned int> idx;
    for (int i = 0; i < vertexCount - 2; i++) {
        idx.push_back(0);
        idx.push_back(i + 1);
        idx.push_back(i + 2);
    }
    return idx;
}

FractureResult PhysicsEngine::computeShatter(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "shatter";

    int count = (int)(impact.destructionRatio * 80) + 10;
    std::mt19937 rng(42);
    std::uniform_real_distribution<float> pos(-radius, radius);
    std::uniform_real_distribution<float> vel(-8.0f, 8.0f);
    std::uniform_real_distribution<float> avel(-5.0f, 5.0f);

    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius * 0.15f * (0.5f + (float)(rng() % 100) / 100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size() / 3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng)) * 2.0f + 2.0f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size * size * 0.5f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }

    result.dustParticleCount = count * 3;
    return result;
}

FractureResult PhysicsEngine::computeFractureMode(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "fracture";

    int count = (int)(impact.destructionRatio * 15) + 3;
    std::mt19937 rng(99);
    std::uniform_real_distribution<float> pos(-radius * 0.8f, radius * 0.8f);
    std::uniform_real_distribution<float> vel(-4.0f, 4.0f);
    std::uniform_real_distribution<float> avel(-3.0f, 3.0f);

    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius * 0.3f * (0.6f + (float)(rng() % 100) / 100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i + 100);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size() / 3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng)) + 1.0f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size * size * 2.0f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }

    result.dustParticleCount = count * 5;
    return result;
}

FractureResult PhysicsEngine::computeDeform(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "deform";

    float depth = (float)(impact.destructionRatio * radius * 0.8f);
    int ring    = 8;
    for (int i = 0; i <= ring; i++) {
        float r     = (float)i / ring * radius;
        float disp  = -depth * std::exp(-3.0f * r / radius);
        int   pts   = std::max(1, i * 4);
        for (int j = 0; j < pts; j++) {
            float angle = (float)j / pts * 2.0f * (float)M_PI;
            DeformVertex dv;
            dv.index = i * 10 + j;
            dv.dx    = r * std::cos(angle) * 0.05f;
            dv.dy    = disp;
            dv.dz    = r * std::sin(angle) * 0.05f;
            result.deformations.push_back(dv);
        }
    }

    result.dustParticleCount = (int)(impact.destructionRatio * 20);
    return result;
}

FractureResult PhysicsEngine::computeFracture(const ImpactResult& impact, const TargetObject& target, float objectRadius) {
    if (impact.destructionRatio < 0.05f) {
        FractureResult r;
        r.mode = "none";
        r.dustParticleCount = 0;
        return r;
    }

    if (target.fractureMode == "shatter") return computeShatter(impact, target, objectRadius);
    if (target.fractureMode == "deform")  return computeDeform(impact, target, objectRadius);
    return computeFractureMode(impact, target, objectRadius);
}

std::vector<FragmentState> PhysicsEngine::stepFragments(
    std::vector<Fragment>& fragments, double dt, double gravity)
{
    std::vector<FragmentState> states;
    for (auto& frag : fragments) {
        if (!frag.active) {
            states.push_back({frag.position, frag.rotation, false});
            continue;
        }

        frag.velocity[1] -= (float)(gravity * dt);

        frag.position[0] += frag.velocity[0] * (float)dt;
        frag.position[1] += frag.velocity[1] * (float)dt;
        frag.position[2] += frag.velocity[2] * (float)dt;

        if (frag.position[1] < -0.5f) {
            frag.position[1] = -0.5f;
            frag.velocity[1] *= -0.3f;
            frag.velocity[0] *= 0.7f;
            frag.velocity[2] *= 0.7f;
            frag.angularVelocity[0] *= 0.5f;
            frag.angularVelocity[2] *= 0.5f;
            if (std::abs(frag.velocity[1]) < 0.1f) frag.active = false;
        }

        float ax = frag.angularVelocity[0] * (float)dt;
        float ay = frag.angularVelocity[1] * (float)dt;
        float az = frag.angularVelocity[2] * (float)dt;

        float qx = frag.rotation[0], qy = frag.rotation[1];
        float qz = frag.rotation[2], qw = frag.rotation[3];

        frag.rotation[0] = qx + (qw*ax - qz*ay + qy*az) * 0.5f;
        frag.rotation[1] = qy + (qz*ax + qw*ay - qx*az) * 0.5f;
        frag.rotation[2] = qz + (-qy*ax + qx*ay + qw*az) * 0.5f;
        frag.rotation[3] = qw + (-qx*ax - qy*ay - qz*az) * 0.5f;

        float len = std::sqrt(
            frag.rotation[0]*frag.rotation[0] + frag.rotation[1]*frag.rotation[1] +
            frag.rotation[2]*frag.rotation[2] + frag.rotation[3]*frag.rotation[3]);
        if (len > 0) {
            frag.rotation[0] /= len; frag.rotation[1] /= len;
            frag.rotation[2] /= len; frag.rotation[3] /= len;
        }

        states.push_back({frag.position, frag.rotation, frag.active});
    }
    return states;
}
