import {
  Attachment,
  CommentsResponse,
  CreateCommentBody,
  CreateCommentResponse,
  Comment,
  UpdateCommentBody,
  UpdateCommentResponse,
  User,
} from "@/types/organization";
import { NextRequest, NextResponse } from "next/server";

/**
 * Get Task Comments
 * @description Retrieve comments for a specific task within a project and organization
 * @pathParams CommentPathParams
 * @params CommentsQueryParams
 * @response CommentsResponse
 * @auth bearer
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string; projectId: string; taskId: string } }
) {
  const { orgId, projectId, taskId } = params;

  // Extract query parameters
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page")) || 1;
  const limit = Number(url.searchParams.get("limit")) || 20;

  const mockUser: User = {
    id: "user123",
    name: "Jane Developer",
    avatar: "https://example.com/avatars/jane.jpg",
    role: "member",
  };

  const mockAttachment: Attachment = {
    id: "attach1",
    fileName: "screenshot.png",
    fileSize: 256000,
    fileType: "image/png",
    url: "https://example.com/files/screenshot.png",
    thumbnailUrl: "https://example.com/files/screenshot_thumb.png",
    uploadedAt: new Date("2023-11-01T10:30:00Z"),
  };

  const mockComments: Comment[] = [
    {
      id: "comment1",
      content: "I think we should consider a different approach to this task.",
      author: mockUser,
      attachments: [mockAttachment],
      mentions: [],
      likes: 3,
      likedBy: ["user456", "user789", "user101"],
      createdAt: new Date("2023-11-01T10:35:00Z"),
    },
    {
      id: "comment2",
      content: "I agree with Jane, let's revisit the requirements.",
      author: {
        id: "user456",
        name: "Mark Manager",
        avatar: "https://example.com/avatars/mark.jpg",
        role: "admin",
      },
      attachments: [],
      mentions: [mockUser],
      likes: 1,
      likedBy: ["user123"],
      createdAt: new Date("2023-11-01T11:15:00Z"),
    },
  ];

  // Construct the response
  const response: CommentsResponse = {
    task: {
      id: taskId,
      title: "Implement API Authentication",
    },
    project: {
      id: projectId,
      name: "Backend Overhaul",
    },
    organization: {
      id: orgId,
      name: "Acme Corporation",
    },
    comments: mockComments,
    pagination: {
      total: 42, // Mock total
      page: page,
      limit: limit,
      pages: Math.ceil(42 / limit),
    },
    permissions: {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canModerate: false,
    },
  };

  return NextResponse.json(response);
}

/**
 * Create Task Comment
 * @description Add a new comment to a specific task
 * @pathParams CommentPathParams
 * @body CreateCommentBody
 * @response CreateCommentResponse
 * @auth bearer
 * @openapi
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string; projectId: string; taskId: string } }
) {
  try {
    // Parse request body
    const body: CreateCommentBody = await request.json();

    // Validate input
    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Comment content is required" },
        { status: 400 }
      );
    }

    // For this example, create a mock comment
    const mockUser: User = {
      id: "user123",
      name: "Jane Developer",
      avatar: "https://example.com/avatars/jane.jpg",
      role: "member",
    };

    const newComment: Comment = {
      id: "comment" + Date.now(),
      content: body.content,
      author: mockUser,
      attachments: [],
      mentions: [],
      likes: 0,
      likedBy: [],
      replyTo: body.replyTo,
      createdAt: new Date(),
    };

    const response: CreateCommentResponse = {
      comment: newComment,
      success: true,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating comment:", error);

    return NextResponse.json(
      {
        success: false,
        message: "An error occurred while creating the comment",
      },
      { status: 500 }
    );
  }
}

/**
 * Update Task Comment
 * @description Modify an existing comment on a task
 * @pathParams CommentPathParams
 * @body UpdateCommentBody
 * @response UpdateCommentResponse
 * @auth bearer
 * @openapi
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { orgId: string; projectId: string; taskId: string } }
) {
  // Get the comment ID from the query parameter
  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId");

  if (!commentId) {
    return NextResponse.json(
      { success: false, message: "Comment ID is required" },
      { status: 400 }
    );
  }

  try {
    // Parse request body
    const body: UpdateCommentBody = await request.json();

    // Validate that there's at least one field to update
    if (
      !body.content &&
      (!body.addAttachmentIds || body.addAttachmentIds.length === 0) &&
      (!body.removeAttachmentIds || body.removeAttachmentIds.length === 0) &&
      (!body.addMentions || body.addMentions.length === 0) &&
      (!body.removeMentions || body.removeMentions.length === 0)
    ) {
      return NextResponse.json(
        { success: false, message: "No update parameters provided" },
        { status: 400 }
      );
    }

    // For this example, create a mock updated comment
    const mockUser: User = {
      id: "user123",
      name: "Jane Developer",
      avatar: "https://example.com/avatars/jane.jpg",
      role: "member",
    };

    const updatedComment: Comment = {
      id: commentId,
      content: body.content || "Original content with updates",
      author: mockUser,
      attachments: [],
      mentions: [],
      likes: 0,
      likedBy: [],
      createdAt: new Date("2023-11-02T09:30:00Z"),
      updatedAt: new Date(),
    };

    const response: UpdateCommentResponse = {
      comment: updatedComment,
      success: true,
      message: "Comment updated successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error updating comment:", error);

    return NextResponse.json(
      {
        success: false,
        message: "An error occurred while updating the comment",
      },
      { status: 500 }
    );
  }
}

/**
 * Delete Task Comment
 * @description Remove a comment from a task (soft delete)
 * @pathParams CommentPathParams
 * @response DeleteCommentResponse
 * @auth bearer
 * @openapi
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { orgId: string; projectId: string; taskId: string } }
) {
  // Get the comment ID from the query parameter
  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId");

  if (!commentId) {
    return NextResponse.json(
      { success: false, message: "Comment ID is required" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting comment:", error);

    return NextResponse.json(
      {
        success: false,
        message: "An error occurred while deleting the comment",
      },
      { status: 500 }
    );
  }
}
