#pragma once
#include <string>
#include <vector>

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
};

struct SimInput {
    FallingObject falling;
    TargetObject  target;
    double height;          
    double airDensity;    
    double gravity;         
};

struct PhysicsFrame {
    double time;        
    double velocity;    
    double altitude;    
    double dragForce;  
    double netForce;    
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

class PhysicsEngine {
public:
    
    static std::vector<FallingObject> getPresetFallingObjects();
    
    static std::vector<TargetObject>  getPresetTargetObjects();
    
    static ImpactResult simulate(const SimInput& input);

private:
    static double calcTerminalVelocity(const FallingObject& obj, double airDensity, double gravity);
    static ImpactResult calcImpact(const SimInput& input, double impactVelocity, const std::vector<PhysicsFrame>& traj);
};
