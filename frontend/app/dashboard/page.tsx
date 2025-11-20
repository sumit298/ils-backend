"use client"
import { Sidebar } from "@/components/Sidebar"
import { Navbar } from "@/components/ui/Navbar"
import { useEffect, useState } from "react"

const Dashboard = () => {
    const [streams, setStreams] = useState([]);

    // const fetchStreams = async ()=> {
    //     try {
    //         const response = await fetch("http://localhost:3001/api/streams")
    //         console.log(response.json())
            
    //     } catch (error) {
            
    //     }
    // }

    // useEffect(()=>{
    //     fetchStreams()
    // },[] )
    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="flex">
                <Sidebar />
                <main className="flex-1">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        {/* Hero Section */}
                        <div className="mb-12">
                            <div className="bg-gradient-to-r from-accent-purple to-accent-pink rounded-2xl p-8 md:p-12 text-white mb-8">
                                <h1 className="text-4xl md:text-5xl font-bold mb-4">
                                    Welcome to StreamApp
                                </h1>
                                <p className="text-lg text-white/90 mb-6 max-w-2xl">
                                    Discover amazing live streams, connect with creators, and join a
                                    vibrant community of viewers and streamers.
                                </p>
                            </div>
                        </div>

                      

                        {/* Live Streams */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-text-primary">
                                    Live Streams
                                </h2>
                                <a
                                    href="/browse"
                                    className="text-primary hover:underline font-medium"
                                >
                                    View all
                                </a>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {/* {featuredStreams.map((stream) => (
                  <StreamCard key={stream.id} {...stream} />
                ))} */}
                            </div>
                        </div>

                        
                    </div>
                </main>
            </div>
        </div>
    );


}

export default Dashboard