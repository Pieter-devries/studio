'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UploadCloud, FileText, Music, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InputFormProps {
  onGenerate: (file: File, lyrics: string) => void;
}

export function InputForm({ onGenerate }: InputFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Helper function to check if file type is supported
  const isValidAudioFile = (fileType: string) => {
    return fileType === 'audio/mpeg' || fileType === 'audio/wav' || fileType === 'audio/wave';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isValidAudioFile(selectedFile.type)) {
        setFile(selectedFile);
      } else {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please upload an MP3 or WAV file.',
        });
      }
    }
  };
  
  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const droppedFile = e.dataTransfer.files[0];
        if (isValidAudioFile(droppedFile.type)) {
            setFile(droppedFile);
            if(fileInputRef.current) {
                fileInputRef.current.files = e.dataTransfer.files;
            }
        } else {
            toast({
                variant: 'destructive',
                title: 'Invalid File Type',
                description: 'Please upload an MP3 or WAV file.',
            });
        }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ variant: 'destructive', title: 'Missing Audio File', description: 'Please upload an audio file.' });
      return;
    }
    if (!lyrics.trim()) {
      toast({ variant: 'destructive', title: 'Missing Lyrics', description: 'Please enter the song lyrics.' });
      return;
    }
    onGenerate(file, lyrics);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="w-full shadow-lg border-2 border-dashed border-border hover:border-primary transition-colors duration-300">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">Create Your Music Video</CardTitle>
          <CardDescription>Upload an audio file (MP3 or WAV) and provide the lyrics to get started.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="audio-upload" className="font-semibold flex items-center gap-2"><Music size={16}/> Audio File</Label>
            <Label 
                htmlFor="audio-upload" 
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted/50 transition-colors ${isDragging ? "border-primary" : "border-border"}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-10 h-10 mb-3 text-slate-500 dark:text-slate-400" />
                    {file ? (
                        <p className="font-semibold text-primary">{file.name}</p>
                    ) : (
                        <>
                        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">MP3 or WAV format</p>
                        </>
                    )}
                </div>
                <Input id="audio-upload" ref={fileInputRef} type="file" className="hidden" accept=".mp3,.wav" onChange={handleFileChange} />
            </Label>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lyrics" className="font-semibold flex items-center gap-2"><FileText size={16}/> Lyrics</Label>
            <Textarea
              id="lyrics"
              placeholder="Paste your song lyrics here..."
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              className="min-h-[200px] text-base"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" size="lg">
            <Wand2 />
            Generate Video
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
