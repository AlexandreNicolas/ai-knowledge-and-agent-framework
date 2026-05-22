import { PartialType } from '@nestjs/mapped-types';
import { CreateCheesecakeDto } from './create-cheesecake.dto';

export class UpdateCheesecakeDto extends PartialType(CreateCheesecakeDto) {}
