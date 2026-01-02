export const getUserNameById = async (id: string): Promise<{
  name: string;
  firstName: string;
}> => {
  // Simulate fetching user data from a database
  const result = await new Promise<[{ name: string }]>((resolve) => {
    return resolve([
      {
        name: "John Doe",
      },
    ]);
  });

  // Do some more processing if needed
  return result.map(({ name }) => ({
    name: name,
    firstName: name.split(" ")[0],
  }))[0];
};
