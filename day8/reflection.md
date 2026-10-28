# Reflection

## The most difficult concept

The hardest concept for me was scaling and system design, especially turning a vague idea like "a lot of traffic" into numbers and then into an architecture. At first, estimates like requests per second and storage per year felt abstract. I overcame it by working through every calculation step by step, writing my assumptions down, and checking my answers a second time. Drawing the architecture as a text diagram and explaining each component in one sentence also helped me understand why each piece exists. Running my SQL in a playground and trying to break it with duplicate rows made constraints and relationships much clearer.

## What I would improve in my capstone

The feedback I received taught me that a technically correct answer is not enough if the work is incomplete. One of my submissions was marked down because the pushed file was cut off before its final sections. Since then, I check that a file is complete, using `wc -l`, `tail` and GitHub, before I commit. I would also add more operational detail to my designs, such as how files are uploaded and how failures are handled, so the design shows how data really moves through the system.

## What I will learn next

Next, I want to learn a backend framework such as Node.js with Express and connect it to a real database. I also want to learn authentication, caching with Redis, and how to deploy an application to the cloud, so I can build and run a small version of the systems I have designed on paper.
