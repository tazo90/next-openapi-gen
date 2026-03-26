// Nested path parameters
export type CommentPathParams = {
  orgId: string; // Organization ID
  projectId: string; // Project ID within the organization
  taskId: string; // Task ID within the project
};

// Query parameters
export type CommentsQueryParams = {
  page?: number; // Page number for pagination
  limit?: number; // Number of comments per page
  sort?: "newest" | "oldest" | "likes"; // Sort order
  includeDeleted?: boolean; // Whether to include soft-deleted comments
  includeReplies?: boolean; // Whether to include replies
  user?: string; // Filter by user ID
};

// User type (nested in other types)
export type User = {
  id: string; // User ID
  name: string; // User's full name
  avatar: string; // URL to user's avatar
  role: "admin" | "member" | "guest"; // User's role in the organization
};

// Attachment type (nested in Comment)
export type Attachment = {
  id: string; // Attachment ID
  fileName: string; // Original file name
  fileSize: number; // Size in bytes
  fileType: string; // MIME type
  url: string; // Download URL
  thumbnailUrl?: string; // Thumbnail URL for images
  uploadedAt: Date; // When the file was uploaded
};

// Comment type
export type Comment = {
  id: string; // Comment ID
  content: string; // Comment content
  author: User; // User who created the comment
  attachments: Attachment[]; // Attached files
  mentions: User[]; // Users mentioned in the comment
  likes: number; // Number of likes
  likedBy: string[]; // User IDs who liked the comment
  replyTo?: string; // Parent comment ID if this is a reply
  replies?: Comment[]; // Child comments (if includeReplies=true)
  createdAt: Date; // Creation timestamp
  updatedAt?: Date; // Last update timestamp
  deletedAt?: Date; // Soft deletion timestamp
};

// Response type for GET method
export type CommentsResponse = {
  task: {
    id: string; // Task ID
    title: string; // Task title
  };
  project: {
    id: string; // Project ID
    name: string; // Project name
  };
  organization: {
    id: string; // Organization ID
    name: string; // Organization name
  };
  comments: Comment[]; // List of comments
  pagination: {
    total: number; // Total number of comments
    page: number; // Current page
    limit: number; // Items per page
    pages: number; // Total number of pages
  };
  permissions: {
    canCreate: boolean; // Whether user can create comments
    canEdit: boolean; // Whether user can edit comments
    canDelete: boolean; // Whether user can delete comments
    canModerate: boolean; // Whether user can moderate comments
  };
};

// Request body for POST method
export type CreateCommentBody = {
  content: string; // Comment content
  attachmentIds?: string[]; // IDs of previously uploaded attachments
  mentions?: string[]; // User IDs mentioned in the comment
  replyTo?: string; // Parent comment ID if this is a reply
};

// Response type for POST method
export type CreateCommentResponse = {
  comment: Comment; // Created comment
  success: boolean; // Whether creation was successful
  message?: string; // Success or error message
};

// Request body for PATCH method
export type UpdateCommentBody = {
  content?: string; // Updated comment content
  addAttachmentIds?: string[]; // IDs of attachments to add
  removeAttachmentIds?: string[]; // IDs of attachments to remove
  addMentions?: string[]; // User IDs to add to mentions
  removeMentions?: string[]; // User IDs to remove from mentions
};

// Response for PATCH method
export type UpdateCommentResponse = {
  comment: Comment; // Updated comment
  success: boolean; // Whether update was successful
  message?: string; // Success or error message
};

// Response for DELETE method
export type DeleteCommentResponse = {
  success: boolean; // Whether deletion was successful
  message?: string; // Success or error message
};
