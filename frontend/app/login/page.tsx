"use client"

import { Lock, Mail, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import {z} from "zod";

const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .email({ message: "Please enter a valid email address" })
        .max(255, { message: "Email must be less than 255 characters" }),
    password: z
        .string()
        .min(8, { message: "Password must be at least 8 characters" })
        .max(100, { message: "Password must be less than 100 characters" }),

})

const Login = () => {
    const [loginData, setloginData] = useState({

        email: "",
        password: "",

    }
    )

    const [showPassword, setShowPassword] = useState(false);

    const [errors, setErrors] = useState({

        email: "",
        password: "",

    }
    )

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setloginData((prev) => ({ ...prev, [name]: value }))
        setErrors((prev) => ({ ...prev, [name]: "" }))
    }

    const handleSubmit = () => {
        try {
            loginSchema.parse(loginData);
            console.log("Valid data:", loginData);
            // Handle successful login here
        } catch (error) {
            if (error instanceof z.ZodError) {
                const newErrors = {
                    email: "",
                    password: "",
                }
                error.issues.forEach((err) => {
                    if (err.path[0]) {
                        newErrors[err.path[0] as keyof typeof newErrors] = err.message
                    }
                })
                setErrors(newErrors)
            }
        }
    }


    return (
        <div className="flex items-center justify-center flex-col h-screen bg-linear-to-br from-accent-purple/10 via-background to-accent-pink/10">
            <div className="flex items-center flex-col justify-center mb-4">
                <h1 className="text-4xl md:text-4xl font-bold bg-linear-to-r from-accent-purple to-accent-pink bg-clip-text text-transparent ">
                    StreamHub
                </h1>
                <span className="text-sm text-gray-600">Sign in to continue streaming</span>
            </div>

            <div className="rounded-md border p-8 mx-4 mt-4 sm:w-3/4 md:w-1/2 lg:w-1/3 w-1/4 shadow-lg max-w-md">
                <div className="mb-7">
                    <p className="text-2xl font-bold">Welcome back</p>
                    <span className="text-sm text-gray-600">Enter your credentials to access your account</span>
                </div>


                <div className="flex flex-col mb-4">
                    <Label htmlFor="email" className="mb-2">Email Address</Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="email"
                            name="email"
                            id="email"
                            placeholder="you@example.com"
                            className="pl-9"
                            onChange={(e) => handleChange(e)}
                            value={loginData.email}
                        />
                        {errors.email && <p className="mt-1 text-destructive text-sm">{errors.email}</p>}
                    </div>
                </div>

                <div className="flex flex-col mb-4">
                    <Label htmlFor="password" className="mb-2">Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3  h-4 w-4 text-muted-foreground" />
                        <Input
                            type={showPassword ? "text": "password"}
                            name="password"
                            id="password"
                            className="pl-9 text-sm"
                            placeholder="Enter your password"
                            onChange={(e) => handleChange(e)}
                            value={loginData.password}

                        />

                        {showPassword ? (
                            <EyeOff className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" onClick={() => setShowPassword(!showPassword)} />
                        ) : (
                            <Eye className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" onClick={() => setShowPassword(!showPassword)} />
                        )}

                        {errors.password && <p className="mt-1 text-destructive text-sm">{errors.password}</p>}
                    </div>
                </div>


                <Button className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 font-semibold" onClick={handleSubmit}
                    disabled={Object.values(errors).some((error) => error !== "") || Object.values(loginData).some((value) => value === "")}>
                    Sign In
                </Button>

                <div className="text-center">
                    <p className="text-sm mt-3">Don't have an account? <Link className="text-accent-purple font-semibold cursor-pointer" href="/register">Create one now</Link></p>
                </div>
            </div>
        </div>
    );
};

export default Login;
