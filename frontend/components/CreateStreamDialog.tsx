
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import toast from "react-hot-toast";
import { Button } from "./ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";


interface CreateStreamDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const categories = [
    "Gaming",
    "Music",
    "Art",
    "Talk Shows",
    "Education",
    "Sports",
    "Technology",
    "Cooking",
    "Fitness",
    "Other"
];

export const CreateStreamDialog = ({ open, onOpenChange }: CreateStreamDialogProps) => {
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const [thumbnail, setThumbnail] = useState("");
    const [tags, setTags] = useState("");
    const router = useRouter();
    //   const { toast } = useToast();

    // call authcontext
    const { user } = useAuth();
    console.log(user)

    const handleCreateStream = async () => {
        if (!title.trim()) {
            toast.error("Please enter a stream title");
            return;
        }

        if (!category) {
            toast.error("Please select a category");
            return;
        }

        // Here you would typically create the stream with all data
        const streamData = {
            title,
            category: category.toLowerCase(),
            description,
            thumbnail: thumbnail || `https://picsum.photos/400/225?random=${Date.now()}`,
            tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
        };

        //api call
        try {
            const response = await fetch("http://localhost:3001/api/streams", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    
                },
                credentials: "include",
                body: JSON.stringify(streamData),
            })

            const result = await response.json();
            console.log(result);
            if(response.ok){
                router.push(`/stream/${result.stream.id}`);
            }
        

            
        } catch (error) {
            
        }

        console.log("Stream data:", streamData);

        toast.success(`Stream "${title}" created successfully!`);

        // Reset form and close dialog
        setTitle("");
        setCategory("");
        setDescription("");
        setThumbnail("");
        setTags("");
        onOpenChange(false);
    };


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle>Create New Stream</DialogTitle>
                    <DialogDescription>
                        Set up your stream details. Fill in the information below to get started.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="title">Stream Title *</Label>
                        <Input
                            id="title"
                            placeholder="Enter your stream title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-surface border-border"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="category">Category *</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger id="category" className="bg-surface border-border">
                                <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                        {cat}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="Tell viewers what your stream is about..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="bg-surface border-border min-h-[100px]"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="thumbnail">Thumbnail URL (optional)</Label>
                        <Input
                            id="thumbnail"
                            placeholder="https://example.com/image.jpg"
                            value={thumbnail}
                            onChange={(e) => setThumbnail(e.target.value)}
                            className="bg-surface border-border"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="tags">Tags (comma-separated)</Label>
                        <Input
                            id="tags"
                            placeholder="gaming, fps, competitive"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="bg-surface border-border"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="default" onClick={handleCreateStream}>
                        Create Stream
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
