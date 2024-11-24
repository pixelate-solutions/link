"use client"

import React, { useState } from "react";

// Interface for note structure
interface Note {
  id: number;
  title: string;
  body: string;
}

const NotesPage = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");

  // Function to handle adding a note
  const addNote = () => {
    if (title && body) {
      setNotes((prevNotes) => [
        ...prevNotes,
        { id: Date.now(), title, body },
      ]);
      setTitle("");
      setBody("");
    }
  };

  // Function to handle deleting a note
  const deleteNote = (id: number) => {
    setNotes((prevNotes) => prevNotes.filter((note) => note.id !== id));
  };

  // Function to handle editing a note
  const editNote = (id: number) => {
    const note = notes.find((note) => note.id === id);
    if (note) {
      setTitle(note.title);
      setBody(note.body);
      deleteNote(id);
    }
  };

  // Filtered notes based on search input
  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 w-full">
      <div className="mb-4 w-[50%] ml-[25%] justify-items-center p-10 rounded-2xl bg-gray-100">
        <input
          type="text"
          placeholder="Enter note title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="block p-2 border border-gray-300 rounded-md mb-2 w-full"
        />
        <textarea
          placeholder="Enter note body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="block p-2 border border-gray-300 rounded-md w-full"
        />
        <button
          onClick={addNote}
          className="mt-2 px-4 py-2 bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-md w-full"
        >
          Add Note
        </button>
      </div>
      
      <div className="mb-4 w-full">
        <input
          type="text"
          placeholder="Search by title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-2 border border-gray-300 rounded-md w-full"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredNotes.map((note) => (
          <div key={note.id} className="border p-4 rounded-md shadow-md">
            <h3 className="font-bold text-lg">{note.title}</h3>
            <p>{note.body}</p>
            <div className="flex justify-between mt-2">
              <button
                onClick={() => editNote(note.id)}
                className="text-yellow-500 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => deleteNote(note.id)}
                className="text-red-500 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotesPage;
