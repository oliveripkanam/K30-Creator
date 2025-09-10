import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';

interface Question {
  id: string;
  content: string;
  extractedText?: string;
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
  fileData?: { base64: string; mimeType: string; name: string };
}

interface QuestionInputProps {
  onSubmit: (question: Question) => void;
  onBack: () => void;
}

export function QuestionInput({ onSubmit, onBack }: QuestionInputProps) {
  const [textContent, setTextContent] = useState('');
  const [marks, setMarks] = useState(1);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState('text');
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const prevent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onPhotoDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDraggingPhoto(true);
  };
  const onPhotoDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDraggingPhoto(false);
  };
  const onPhotoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPhotoFile(file);
    }
  };

  const isAllowedDoc = (file: File) => {
    const name = file.name.toLowerCase();
    return (
      file.type === 'application/pdf' ||
      file.type === 'application/msword' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx')
    );
  };
  const onFileDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDraggingFile(true);
  };
  const onFileDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDraggingFile(false);
  };
  const onFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    prevent(e);
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isAllowedDoc(file)) {
      setUploadFile(file);
    }
  };

  const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file read failed'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });

  const handleSubmit = async () => {
    let content = '';
    let type: 'photo' | 'file' | 'text' = 'text';
    let fileData: Question['fileData'] | undefined;

    switch (activeTab) {
      case 'photo':
        if (!photoFile) return;
        content = `Photo uploaded: ${photoFile.name}`;
        type = 'photo';
        fileData = {
          base64: await readAsBase64(photoFile),
          mimeType: photoFile.type || 'image/*',
          name: photoFile.name,
        };
        break;
      case 'file':
        if (!uploadFile) return;
        content = `File uploaded: ${uploadFile.name}`;
        type = 'file';
        fileData = {
          base64: await readAsBase64(uploadFile),
          mimeType: uploadFile.type || 'application/octet-stream',
          name: uploadFile.name,
        };
        break;
      case 'text':
        if (!textContent.trim()) return;
        content = textContent;
        type = 'text';
        break;
    }

    const question: Question = {
      id: Date.now().toString(),
      content,
      marks,
      type,
      timestamp: new Date(),
      fileData,
    };

    onSubmit(question);
  };

  const isValid = () => {
    switch (activeTab) {
      case 'photo':
        return photoFile && marks > 0;
      case 'file':
        return uploadFile && marks > 0;
      case 'text':
        return textContent.trim() && marks > 0;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back</span>
            </Button>
            <h1 className="text-lg sm:text-xl font-medium">Input Question</h1>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3 sm:p-4 lg:p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Add Your Mechanics Question</CardTitle>
            <CardDescription className="text-sm">
              Choose how you'd like to input your A Level mechanics question. For photos and files, you'll be able to review the extracted text before proceeding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-auto">
                <TabsTrigger value="text" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 py-3 sm:py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-xs sm:text-sm">Type Text</span>
                </TabsTrigger>
                <TabsTrigger value="photo" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 py-3 sm:py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs sm:text-sm">Photo</span>
                </TabsTrigger>
                <TabsTrigger value="file" className="flex flex-col sm:flex-row items-center space-y-1 sm:space-y-0 sm:space-x-2 py-3 sm:py-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs sm:text-sm">File</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-4">
                <div>
                  <Label htmlFor="question-text">Question Text</Label>
                  <Textarea
                    id="question-text"
                    placeholder="Enter your A Level mechanics question here... 

Example: A ball is thrown horizontally from the top of a building 20m high with an initial velocity of 15 m/s. Calculate the time taken for the ball to reach the ground and the horizontal distance traveled."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    className="min-h-32 mt-2"
                  />
                </div>
              </TabsContent>

              <TabsContent value="photo" className="space-y-4">
                <div>
                  <Label htmlFor="photo-upload">Take or Upload Photo</Label>
                  <div
                    className={`mt-2 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDraggingPhoto ? 'border-purple-400 bg-purple-50' : 'border-gray-300'
                    }`}
                    onDragOver={onPhotoDragOver}
                    onDragEnter={onPhotoDragOver}
                    onDragLeave={onPhotoDragLeave}
                    onDrop={onPhotoDrop}
                  >
                    {photoFile ? (
                      <div className="space-y-2">
                        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-sm">{photoFile.name}</p>
                        <Button variant="outline" size="sm" onClick={() => setPhotoFile(null)}>
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Drag & drop an image here, or click to choose</p>
                          <p className="text-xs text-gray-400">PNG, JPG up to 10MB</p>
                          <p className="text-xs text-purple-600 mt-1">✨ AI will analyze and extract text from your image</p>
                        </div>
                        <Input
                          id="photo-upload"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                        <Button 
                          variant="outline" 
                          onClick={() => document.getElementById('photo-upload')?.click()}
                        >
                          Choose Photo
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="file" className="space-y-4">
                <div>
                  <Label htmlFor="file-upload">Upload Document</Label>
                  <div
                    className={`mt-2 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDraggingFile ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                    }`}
                    onDragOver={onFileDragOver}
                    onDragEnter={onFileDragOver}
                    onDragLeave={onFileDragLeave}
                    onDrop={onFileDrop}
                  >
                    {uploadFile ? (
                      <div className="space-y-2">
                        <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <p className="text-sm">{uploadFile.name}</p>
                        <Button variant="outline" size="sm" onClick={() => setUploadFile(null)}>
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Drag & drop a PDF/DOC here, or click to choose</p>
                          <p className="text-xs text-gray-400">PDF, DOC, DOCX up to 10MB</p>
                          <p className="text-xs text-blue-600 mt-1">✨ AI will analyze and extract text from your document</p>
                        </div>
                        <Input
                          id="file-upload"
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                        <Button 
                          variant="outline" 
                          onClick={() => document.getElementById('file-upload')?.click()}
                        >
                          Choose File
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Marks Input */}
            <div className="space-y-2">
              <Label htmlFor="marks">Question Worth (Marks)</Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                <Input
                  id="marks"
                  type="number"
                  min="1"
                  max="20"
                  value={marks}
                  onChange={(e) => setMarks(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
                <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-1 w-full sm:w-auto">
                  {[1, 2, 3, 4, 5, 6].map((mark) => (
                    <Button
                      key={mark}
                      variant={marks === mark ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMarks(mark)}
                      className="h-10 sm:h-8"
                    >
                      {mark}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This will determine how many step-by-step questions we create
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-center sm:justify-end pt-4">
              <Button 
                onClick={handleSubmit} 
                disabled={!isValid()}
                size="lg"
                className="px-6 sm:px-8 w-full sm:w-auto"
              >
                {activeTab === 'text' ? 'Decode Question' : 'Extract & Verify'}
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}