#define _USE_MATH_DEFINES
#include "physics.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <random>

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
        {"Wooden Board",   40.0,  0.10, "wood",     "fracture"},
        {"Concrete Floor", 30.0,  0.40, "concrete", "fracture"},
        {"Steel Plate",    250.0, 0.02, "steel",    "deform"},
        {"Glass",          7.0,   0.012,"glass",    "shatter"},
        {"Brick Wall",     10.0,  0.40, "brick",    "fracture"},
        {"Car Roof",       180.0, 0.004,"steel",    "deform"},
    };
}

double PhysicsEngine::calcAirDensity(double alt) {
    if (alt < 0) alt = 0;
    const double R = 287.05, g = 9.80665, L0 = 0.0065, T0 = 288.15, P0 = 101325.0;
    if (alt <= 11000.0) {
        double T = T0 - L0*alt;
        double P = P0*std::pow(T/T0, g/(R*L0));
        return P/(R*T);
    } else if (alt <= 20000.0) {
        double T11 = T0-L0*11000.0;
        double P11 = P0*std::pow(T11/T0, g/(R*L0));
        double P   = P11*std::exp(-g*(alt-11000.0)/(R*T11));
        return P/(R*T11);
    } else if (alt <= 32000.0) {
        double T11 = T0-L0*11000.0;
        double P11 = P0*std::pow(T11/T0, g/(R*L0));
        double P20 = P11*std::exp(-g*9000.0/(R*T11));
        double T20 = 216.65, L2 = 0.001;
        double T   = T20+L2*(alt-20000.0);
        double P   = P20*std::pow(T/T20, -g/(R*L2));
        return P/(R*T);
    } else if (alt <= 80000.0) {
        double rho32 = calcAirDensity(32000.0);
        return rho32*std::exp(-0.0001*(alt-32000.0));
    }
    return 1e-5;
}

std::string PhysicsEngine::getAtmosphereName(double alt) {
    if (alt < 0)     return "Underground";
    if (alt < 11000) return "Troposphere";
    if (alt < 20000) return "Lower Stratosphere";
    if (alt < 32000) return "Upper Stratosphere";
    if (alt < 50000) return "Stratopause";
    if (alt < 80000) return "Mesosphere";
    return "Near Vacuum";
}

double PhysicsEngine::calcTerminalVelocityAtAlt(
    const FallingObject& obj, double altitude, double gravity)
{
    double rho = calcAirDensity(altitude);
    if (rho < 1e-10) return 1e9;
    return std::sqrt((2.0*obj.mass*gravity)/(rho*obj.cd*obj.area));
}

ImpactResult PhysicsEngine::simulate(const SimInput& input) {
    if (input.height <= 0)
        throw std::invalid_argument("Height must be greater than 0.");

    const double g  = input.gravity;
    const FallingObject& obj = input.falling;
    const double dt = 0.05;
    double v = 0.0, altitude = input.height, t = 0.0;

    std::vector<PhysicsFrame> traj;
    traj.reserve(2000);

    while (altitude > 0.0 && t < 7200.0) {
        double rho   = calcAirDensity(altitude);
        double drag  = 0.5*rho*obj.cd*obj.area*v*v;
        double netF  = obj.mass*g - drag;
        double accel = netF/obj.mass;

        PhysicsFrame frame;
        frame.time       = t;
        frame.velocity   = v;
        frame.altitude   = altitude;
        frame.dragForce  = drag;
        frame.netForce   = netF;
        frame.airDensity = rho;
        frame.atmosphere = getAtmosphereName(altitude);
        traj.push_back(frame);

        v        += accel*dt;
        altitude -= v*dt;
        t        += dt;
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
    double collisionTime = 0.001 + 0.009 * (target.yieldStrength / 250.0);
    collisionTime        = std::clamp(collisionTime, 0.0005, 0.02);
    double F_avg         = J / collisionTime;

    double contactArea   = M_PI * obj.radius * obj.radius;
    if (contactArea < 1e-6) contactArea = 1e-6;
    double pressure_Pa   = F_avg / contactArea;
    double pressure_MPa  = pressure_Pa / 1e6;

    double rawRatio = pressure_MPa / target.yieldStrength;

    double destructionRatio = 1.0 - std::exp(-0.7 * rawRatio);
    destructionRatio = std::clamp(destructionRatio, 0.0, 1.0);

    std::string level;
    if (destructionRatio < 0.15)       level = "No Damage";
    else if (destructionRatio < 0.35)  level = "Minor Damage";
    else if (destructionRatio < 0.60)  level = "Moderate Damage";
    else if (destructionRatio < 0.80)  level = "Severe Damage";
    else                               level = "Total Destruction";

    ImpactResult result;
    result.terminalVelocity = calcTerminalVelocityAtAlt(input.falling, 0, input.gravity);
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
    std::uniform_real_distribution<float> jitter(-size*0.35f, size*0.35f);
    std::uniform_real_distribution<float> sc(0.5f, 1.0f);
    std::vector<float> verts;
    int faces = 6+(seed%5);
    for (int i = 0; i < faces; i++) {
        float theta = (float)i/faces*2.0f*(float)M_PI;
        for (int j = 0; j < 3; j++) {
            float phi = ((float)j/3.0f-0.5f)*(float)M_PI;
            float r   = size*sc(rng);
            verts.push_back(cx+r*std::cos(phi)*std::cos(theta)+jitter(rng));
            verts.push_back(cy+r*std::sin(phi)+jitter(rng));
            verts.push_back(cz+r*std::cos(phi)*std::sin(theta)+jitter(rng));
        }
    }
    return verts;
}

std::vector<unsigned int> PhysicsEngine::buildFragmentIndices(int vertexCount) {
    std::vector<unsigned int> idx;
    for (int i = 0; i < vertexCount-2; i++) {
        idx.push_back(0); idx.push_back(i+1); idx.push_back(i+2);
    }
    return idx;
}

FractureResult PhysicsEngine::computeShatter(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "shatter";
    int count = (int)(impact.destructionRatio*100)+20;
    std::mt19937 rng(42);
    std::uniform_real_distribution<float> pos(-radius*1.5f, radius*1.5f);
    std::uniform_real_distribution<float> vel(-12.0f, 12.0f);
    std::uniform_real_distribution<float> avel(-8.0f, 8.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.2f*(0.4f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng))*2.5f+3.0f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*0.5f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = count*4;
    return result;
}

FractureResult PhysicsEngine::computeFractureMode(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "fracture";
    int count = (int)(impact.destructionRatio*20)+5;
    std::mt19937 rng(99);
    std::uniform_real_distribution<float> pos(-radius*1.2f, radius*1.2f);
    std::uniform_real_distribution<float> vel(-6.0f, 6.0f);
    std::uniform_real_distribution<float> avel(-4.0f, 4.0f);
    for (int i = 0; i < count; i++) {
        float cx = pos(rng), cz = pos(rng);
        float size = radius*0.4f*(0.5f+(float)(rng()%100)/100.0f);
        Fragment frag;
        frag.vertices  = buildConvexFragment(cx, 0.0f, cz, size, i+100);
        frag.indices   = buildFragmentIndices((int)frag.vertices.size()/3);
        frag.position  = {cx, 0.0f, cz};
        frag.velocity  = {vel(rng), std::abs(vel(rng))*1.5f+1.5f, vel(rng)};
        frag.angularVelocity = {avel(rng), avel(rng), avel(rng)};
        frag.rotation  = {0.0f, 0.0f, 0.0f, 1.0f};
        frag.mass      = size*size*2.0f;
        frag.active    = true;
        result.fragments.push_back(frag);
    }
    result.dustParticleCount = count*6;
    return result;
}

FractureResult PhysicsEngine::computeDeform(const ImpactResult& impact, const TargetObject& target, float radius) {
    FractureResult result;
    result.mode = "deform";
    float depth = (float)(impact.destructionRatio*radius*1.2f);
    int ring = 10;
    for (int i = 0; i <= ring; i++) {
        float r    = (float)i/ring*radius;
        float disp = -depth*std::exp(-3.0f*r/radius);
        int pts    = std::max(1, i*4);
        for (int j = 0; j < pts; j++) {
            float angle = (float)j/pts*2.0f*(float)M_PI;
            DeformVertex dv;
            dv.index = i*10+j;
            dv.dx    = r*std::cos(angle)*0.05f;
            dv.dy    = disp;
            dv.dz    = r*std::sin(angle)*0.05f;
            result.deformations.push_back(dv);
        }
    }
    result.dustParticleCount = (int)(impact.destructionRatio*40);
    return result;
}

FractureResult PhysicsEngine::computeFracture(const ImpactResult& impact, const TargetObject& target, float objectRadius) {
    if (impact.destructionRatio < 0.03f) {
        FractureResult r; r.mode="none"; r.dustParticleCount=0; return r;
    }
    if (target.fractureMode == "shatter")  return computeShatter(impact, target, objectRadius);
    if (target.fractureMode == "deform")   return computeDeform(impact, target, objectRadius);
    return computeFractureMode(impact, target, objectRadius);
}

std::vector<FragmentState> PhysicsEngine::stepFragments(
    std::vector<Fragment>& fragments, double dt, double gravity)
{
    std::vector<FragmentState> states;
    for (auto& frag : fragments) {
        if (!frag.active) { states.push_back({frag.position, frag.rotation, false}); continue; }
        frag.velocity[1] -= (float)(gravity*dt);
        frag.position[0] += frag.velocity[0]*(float)dt;
        frag.position[1] += frag.velocity[1]*(float)dt;
        frag.position[2] += frag.velocity[2]*(float)dt;
        if (frag.position[1] < -0.5f) {
            frag.position[1]  = -0.5f;
            frag.velocity[1] *= -0.35f;
            frag.velocity[0] *= 0.65f;
            frag.velocity[2] *= 0.65f;
            frag.angularVelocity[0] *= 0.5f;
            frag.angularVelocity[2] *= 0.5f;
            if (std::abs(frag.velocity[1]) < 0.1f) frag.active = false;
        }
        float ax=frag.angularVelocity[0]*(float)dt, ay=frag.angularVelocity[1]*(float)dt, az=frag.angularVelocity[2]*(float)dt;
        float qx=frag.rotation[0], qy=frag.rotation[1], qz=frag.rotation[2], qw=frag.rotation[3];
        frag.rotation[0] = qx+(qw*ax-qz*ay+qy*az)*0.5f;
        frag.rotation[1] = qy+(qz*ax+qw*ay-qx*az)*0.5f;
        frag.rotation[2] = qz+(-qy*ax+qx*ay+qw*az)*0.5f;
        frag.rotation[3] = qw+(-qx*ax-qy*ay-qz*az)*0.5f;
        float len = std::sqrt(frag.rotation[0]*frag.rotation[0]+frag.rotation[1]*frag.rotation[1]+frag.rotation[2]*frag.rotation[2]+frag.rotation[3]*frag.rotation[3]);
        if (len > 0) { frag.rotation[0]/=len; frag.rotation[1]/=len; frag.rotation[2]/=len; frag.rotation[3]/=len; }
        states.push_back({frag.position, frag.rotation, frag.active});
    }
    return states;
}
