"use client";

import { Lock, Mail, User, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import {z} from "zod";
import { useRouter } from "next/navigation";

const registerSchema = z
    .object({
        username: z
            .string()
            .trim()
            .min(3, { message: "Username must be at least 3 characters" })
            .max(20, { message: "Username must be less than 20 characters" })
            .regex(/^[a-zA-Z0-9_]+$/, {
                message: "Username can only contain letters, numbers, and underscores",
            }),
        email: z
            .string()
            .trim()
            .email({ message: "Please enter a valid email address" })
            .max(255, { message: "Email must be less than 255 characters" }),
        password: z
            .string()
            .min(8, { message: "Password must be at least 8 characters" })
            .max(100, { message: "Password must be less than 100 characters" })
            .regex(/[A-Z]/, {
                message: "Password must contain at least one uppercase letter",
            })
            .regex(/[0-9]/, { message: "Password must contain at least one number" }),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

const Register = () => {
    const [registerData, setRegisterData] = useState({
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
    });

    const router = useRouter();

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [errors, setErrors] = useState({
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setRegisterData((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: "" }));
    };

    const handleSubmit = async () => {
        try {
            registerSchema.parse(registerData);

            const apiData = {
                username: registerData.username,
                email: registerData.email,
                password: registerData.password
            }
            console.log("Valid data:", registerData);
            const registerResult = await fetch("http://localhost:3001/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify(apiData)
            })

            const result = await registerResult.json();
            console.log(result); 

            if(registerResult.ok){
                
                setRegisterData({
                    email: "",
                    username: "",
                    password: "",
                    confirmPassword: ""
                })

                router.push("/dashboard")
            }
            else{
                if(result.errors){
                    setErrors(result.errors)
                }
            }
            
            // reset the state

            // Handle successful registration here
        } catch (error) {
            if (error instanceof z.ZodError) {
                const newErrors = {
                    username: "",
                    email: "",
                    password: "",
                    confirmPassword: "",
                };
                error.issues.forEach((err) => {
                    if (err.path[0]) {
                        newErrors[err.path[0] as keyof typeof newErrors] = err.message;
                    }
                });
                setErrors(newErrors);
            }
        }
    };

    return (
        <div className="flex items-center justify-center flex-col h-screen bg-linear-to-br from-accent-purple/10 via-background to-accent-pink/10">
            <div className="flex items-center flex-col justify-center mb-4">
                <h1 className="text-4xl md:text-4xl font-bold bg-linear-to-r from-accent-purple to-accent-pink bg-clip-text text-transparent ">
                    StreamHub
                </h1>
                <span className="text-sm text-gray-600">
                    Create your account and Start Streaming
                </span>
            </div>

            <div className="rounded-md border p-8 mx-4 mt-4 sm:w-3/4 md:w-1/2 lg:w-1/3 w-1/4 shadow-lg max-w-md">
                <div className="mb-7">
                    <p className="text-2xl font-bold">Get Started</p>
                    <span className="text-sm text-gray-600">
                        Create your account to join community
                    </span>
                </div>

                <div className="flex flex-col mb-4">
                    <Label htmlFor="username" className="mb-2">
                        Username
                    </Label>
                    <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Choose a username"
                            name="username"
                            id="username"
                            className="pl-9"
                            onChange={(e) => handleChange(e)}
                            value={registerData.username}
                        />
                        {errors.username && (
                            <p className="mt-1 text-destructive text-sm">{errors.username}</p>
                        )}
                    </div>
                </div>
                <div className="flex flex-col mb-4">
                    <Label htmlFor="email" className="mb-2">
                        Email
                    </Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="email"
                            name="email"
                            id="email"
                            placeholder="you@example.com"
                            className="pl-9"
                            onChange={(e) => handleChange(e)}
                            value={registerData.email}
                        />
                        {errors.email && (
                            <p className="mt-1 text-destructive text-sm">{errors.email}</p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col mb-4">
                    <Label htmlFor="password" className="mb-2">
                        Password
                    </Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 -mt-0.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            id="password"
                            className="pl-9 text-sm"
                            placeholder="Create a strong password"
                            onChange={(e) => handleChange(e)}
                            value={registerData.password}
                        />
                        <button type="button" className="absolute right-3 top-3 -mt-1  text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? (
                                <EyeOff className="h-5 w-5" />
                            ) : (
                                <Eye className="h-5 w-5" />
                            )}
                        </button>

                        {errors.password && (
                            <p className="mt-1 text-destructive text-sm">{errors.password}</p>
                        )}
                    </div>
                </div>
                <div className="flex flex-col mb-6">
                    <Label htmlFor="confirmPassword" className="mb-2">
                        Confirm Password
                    </Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            type={showConfirmPassword ? "text" : "password"}
                            name="confirmPassword"
                            id="confirmPassword"
                            placeholder="Confirm your password"
                            className="pl-9"
                            onChange={(e) => handleChange(e)}
                            value={registerData.confirmPassword}
                        />
                        <button className="absolute right-3 top-3 -mt-1 text-muted-foreground hover:text-foreground transition-colors"
                        type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                            {showConfirmPassword ? (
                                <EyeOff className="h-5 w-5" />
                            ) : (
                                <Eye className="h-5 w-5" />
                            )}
                        </button>
                        {errors.confirmPassword && (
                            <p className="mt-1 text-destructive text-sm">
                                {errors.confirmPassword}
                            </p>
                        )}
                    </div>
                </div>

                <Button
                    className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 font-semibold"
                    onClick={handleSubmit}
                    disabled={
                        Object.values(errors).some((error) => error !== "") ||
                        Object.values(registerData).some((value) => value === "")
                    }
                >
                    Create Account
                </Button>

                <div className="text-center">
                    <p className="text-sm mt-3">
                        Already have an account?{" "}
                        <Link
                            className="text-accent-purple font-semibold cursor-pointer"
                            href="/login"
                        >
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;
